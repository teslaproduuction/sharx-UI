package job

import (
	"bufio"
	"net"
	"os"
	"regexp"
	"strings"
	"sync"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

// XrayLogTailJob tails Xray access/error log files and forwards new lines into panel logger buffer.
// This is required when Xray is configured to write logs to files instead of stdout/stderr.
type XrayLogTailJob struct {
	mu       sync.Mutex
	offsets  map[string]int64
	inited   bool
}

var xrayLogTailJob *XrayLogTailJob
var xrayTailConnRegex = regexp.MustCompile(`(?i)\sfrom\s+([^\s]+)\s+accepted\s+[^\[]+\[[^\]]+\]\s+\[[^\]]+\]\s+email:\s*([^\s]+)`)

func NewXrayLogTailJob() *XrayLogTailJob {
	if xrayLogTailJob == nil {
		xrayLogTailJob = &XrayLogTailJob{
			offsets: make(map[string]int64),
		}
	}
	return xrayLogTailJob
}

func (j *XrayLogTailJob) Run() {
	j.mu.Lock()
	defer j.mu.Unlock()

	paths := make([]string, 0, 2)

	if p, err := xray.GetAccessLogPath(); err == nil && p != "" && p != "none" {
		paths = append(paths, p)
	}
	if p, err := xray.GetErrorLogPath(); err == nil && p != "" && p != "none" {
		paths = append(paths, p)
	}
	if len(paths) == 0 {
		return
	}

	// On first run, initialize offsets to EOF so we don't dump historical files.
	if !j.inited {
		for _, p := range paths {
			if st, err := os.Stat(p); err == nil {
				j.offsets[p] = st.Size()
			}
		}
		j.inited = true
		return
	}

	for _, p := range paths {
		j.tailNewLinesLocked(p, strings.HasSuffix(p, ".log") && strings.Contains(strings.ToLower(p), "error"))
	}
}

func (j *XrayLogTailJob) tailNewLinesLocked(path string, isErrorFile bool) {
	st, err := os.Stat(path)
	if err != nil || st.IsDir() {
		return
	}

	prev := j.offsets[path]
	size := st.Size()
	if prev > size {
		// Truncated/rotated.
		prev = 0
	}
	if prev == size {
		return
	}

	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	if _, err := f.Seek(prev, 0); err != nil {
		return
	}

	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		// Avoid infinite loops if someone writes our own forwarded marker into the same file.
		if strings.Contains(line, "XRAY:") {
			// still forward, but don't double-prefix
		}

		msg := line
		level := "info"
		lower := strings.ToLower(line)
		if isErrorFile || strings.Contains(lower, "error") || strings.Contains(lower, "failed") {
			level = "error"
		}

		if m := xrayTailConnRegex.FindStringSubmatch(line); len(m) >= 3 {
			ip := strings.TrimSpace(strings.TrimPrefix(m[1], "/"))
			if host, _, err := net.SplitHostPort(ip); err == nil {
				ip = host
			}
			ip = strings.Trim(ip, "[]")
			email := strings.TrimSpace(m[2])
			if ip != "" && email != "" {
				msg = "user-connected email=" + email + " ip=" + ip
				level = "info"
			}
		}

		logger.Emit(logger.Entry{
			Level:     level,
			Source:    "xray",
			Msg:       msg,
			Channel:   "access",
			Component: "xray",
		})
	}

	// Update offset to current EOF (best-effort).
	if end, err := f.Seek(0, 1); err == nil {
		j.offsets[path] = end
	} else {
		j.offsets[path] = size
	}
}

