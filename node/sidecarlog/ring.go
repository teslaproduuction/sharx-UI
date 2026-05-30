// Package sidecarlog provides a tiny thread-safe, fixed-size ring buffer that
// captures the recent stdout/stderr lines of a sidecar child process (sing-box,
// Telemt). It implements io.Writer so it can be teed into a process's output via
// io.MultiWriter, and exposes the last N lines for the panel "Cores" log viewer.
package sidecarlog

import (
	"strings"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
)

// Line is one captured output line with a capture timestamp (unix ms).
type Line struct {
	TsUnixMs int64  `json:"tsUnixMs"`
	Text     string `json:"text"`
}

// Ring is a fixed-capacity ring buffer of recent log lines.
type Ring struct {
	mu      sync.Mutex
	lines   []Line
	max     int
	partial string // accumulates bytes until a newline arrives
}

// New returns a ring that retains at most max lines (min 64).
func New(max int) *Ring {
	if max < 64 {
		max = 64
	}
	return &Ring{max: max, lines: make([]Line, 0, max)}
}

// nowMs is overridable in tests; defaults to wall clock.
var nowMs = func() int64 { return time.Now().UnixMilli() }

// Write implements io.Writer. It splits incoming bytes on newlines and appends
// each complete line, buffering any trailing partial line until the next Write.
func (r *Ring) Write(p []byte) (int, error) {
	if r == nil {
		return len(p), nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.partial += string(p)
	for {
		idx := strings.IndexByte(r.partial, '\n')
		if idx < 0 {
			break
		}
		text := strings.TrimRight(r.partial[:idx], "\r")
		r.partial = r.partial[idx+1:]
		r.appendLocked(text)
	}
	return len(p), nil
}

func (r *Ring) appendLocked(text string) {
	r.lines = append(r.lines, Line{TsUnixMs: nowMs(), Text: text})
	if len(r.lines) > r.max {
		// Drop oldest; keep the slice bounded.
		copy(r.lines, r.lines[len(r.lines)-r.max:])
		r.lines = r.lines[:r.max]
	}
}

// Lines returns up to the last n captured lines (n<=0 → all retained).
func (r *Ring) Lines(n int) []Line {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if n <= 0 || n >= len(r.lines) {
		out := make([]Line, len(r.lines))
		copy(out, r.lines)
		return out
	}
	out := make([]Line, n)
	copy(out, r.lines[len(r.lines)-n:])
	return out
}

// prefixWriter buffers bytes per-line and writes each complete line to the ring
// with a fixed prefix (e.g. "[telemt-1] "). Lets several multi-instance sidecars
// share one ring while staying attributable. Safe for concurrent instances —
// each has its own prefixWriter; the ring itself is synchronized.
type prefixWriter struct {
	ring    *Ring
	prefix  string
	mu      sync.Mutex
	partial string
}

// PrefixWriter returns an io.Writer that tags each complete line with prefix
// before storing it in r.
func (r *Ring) PrefixWriter(prefix string) *prefixWriter {
	return &prefixWriter{ring: r, prefix: prefix}
}

func (w *prefixWriter) Write(p []byte) (int, error) {
	if w == nil || w.ring == nil {
		return len(p), nil
	}
	w.mu.Lock()
	w.partial += string(p)
	var lines []string
	for {
		idx := strings.IndexByte(w.partial, '\n')
		if idx < 0 {
			break
		}
		lines = append(lines, strings.TrimRight(w.partial[:idx], "\r"))
		w.partial = w.partial[idx+1:]
	}
	w.mu.Unlock()
	for _, ln := range lines {
		w.ring.mu.Lock()
		w.ring.appendLocked(w.prefix + ln)
		w.ring.mu.Unlock()
	}
	return len(p), nil
}

// loggerWriter forwards each complete output line of a sidecar child into the
// central structured logger (logger.Emit) tagged with a source ("telemt" /
// "singbox"), so the lines surface in the unified panel "Журнал" log viewer and
// the live SSE stream alongside panel/xray/node — with an inferred level so
// errors are highlighted.
type loggerWriter struct {
	source  string
	mu      sync.Mutex
	partial string
}

// NewLoggerWriter returns an io.Writer that emits each line to the central
// logger under the given source.
func NewLoggerWriter(source string) *loggerWriter {
	return &loggerWriter{source: source}
}

func inferLevel(s string) string {
	l := strings.ToLower(s)
	switch {
	case strings.Contains(l, "panic"), strings.Contains(l, "fatal"),
		strings.Contains(l, "error"), strings.Contains(l, "failed"),
		strings.Contains(l, "refused"):
		return "error"
	case strings.Contains(l, "warn"):
		return "warn"
	default:
		return "info"
	}
}

func (w *loggerWriter) Write(p []byte) (int, error) {
	if w == nil {
		return len(p), nil
	}
	w.mu.Lock()
	w.partial += string(p)
	var lines []string
	for {
		idx := strings.IndexByte(w.partial, '\n')
		if idx < 0 {
			break
		}
		lines = append(lines, strings.TrimRight(w.partial[:idx], "\r"))
		w.partial = w.partial[idx+1:]
	}
	w.mu.Unlock()
	for _, ln := range lines {
		if strings.TrimSpace(ln) == "" {
			continue
		}
		logger.Emit(logger.Entry{Source: w.source, Level: inferLevel(ln), Msg: ln})
	}
	return len(p), nil
}

// Clear drops all retained lines (e.g. on restart, so logs reflect the new run).
func (r *Ring) Clear() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.lines = r.lines[:0]
	r.partial = ""
}
