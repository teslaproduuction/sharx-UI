// Package telemt runs Telemt (MTProto) sidecar processes on the SharX node.
package telemt

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/sidecarlog"
)

// Payload is one inbound worth of Telemt configuration (TOML file contents).
type Payload struct {
	InboundId int    `json:"inboundId"`
	Tag       string `json:"tag"`
	Toml      string `json:"toml"`
}

// Manager supervises one Telemt OS process per inbound tag.
type Manager struct {
	mu         sync.Mutex
	running    map[string]*procState
	workRootMu sync.RWMutex
	workRoot   string // if empty: TELEMT_WORK_ROOT env, else /app/telemt

	// Replay snapshot used by POST /restart-telemt after any successful Apply (including config pull).
	replayMu sync.RWMutex
	replayOK bool
	replay   []Payload

	// Combined recent stdout/stderr ring across all Telemt instances (panel log viewer).
	logs *sidecarlog.Ring
}

// Logs returns up to the last n captured output lines across all Telemt instances.
func (m *Manager) Logs(n int) []sidecarlog.Line {
	return m.logWriter().Lines(n)
}

func (m *Manager) logWriter() *sidecarlog.Ring {
	// The ring is internally synchronized; never take m.mu here (Apply holds it
	// while spawning, so locking would deadlock).
	if m.logs == nil {
		m.logs = sidecarlog.New(500)
	}
	return m.logs
}

type procState struct {
	cancel context.CancelFunc
	hash   string
}

// NewManager creates a Telemt manager.
func NewManager() *Manager {
	return &Manager{running: make(map[string]*procState), logs: sidecarlog.New(500)}
}

func (m *Manager) commitReplaySnapshot(payloads []Payload) {
	if m == nil {
		return
	}
	cp := append([]Payload(nil), payloads...)
	m.replayMu.Lock()
	m.replay = cp
	m.replayOK = true
	m.replayMu.Unlock()
}

// ReplaySnapshotForRestart returns the last payloads successfully applied to this Manager, if any.
// An empty-but-valid snapshot means Telemt was intentionally cleared via Apply([]Payload{}).
func (m *Manager) ReplaySnapshotForRestart() ([]Payload, bool) {
	if m == nil {
		return nil, false
	}
	m.replayMu.RLock()
	defer m.replayMu.RUnlock()
	if !m.replayOK {
		return nil, false
	}
	return append([]Payload(nil), m.replay...), true
}

// SetWorkRoot sets the per-manager state directory root (e.g.panel: $XUI_DATA_FOLDER/telemt).
// Worker nodes omit this and rely on TELEMT_WORK_ROOT or the default /app/telemt.
func (m *Manager) SetWorkRoot(abs string) {
	if m == nil {
		return
	}
	m.workRootMu.Lock()
	defer m.workRootMu.Unlock()
	m.workRoot = strings.TrimSpace(abs)
}

func (m *Manager) stateDirForTag(tag string) string {
	m.workRootMu.RLock()
	root := strings.TrimSpace(m.workRoot)
	m.workRootMu.RUnlock()
	if root == "" {
		root = strings.TrimSpace(os.Getenv("TELEMT_WORK_ROOT"))
	}
	if root == "" {
		root = "/app/telemt"
	}
	return filepath.Join(root, tag)
}

func findTelemtBinary() string {
	if p := strings.TrimSpace(os.Getenv("TELEMT_BIN")); p != "" {
		return p
	}
	candidates := []string{
		"/app/bin/telemt",
		"bin/telemt",
		"./bin/telemt",
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

// Stop shuts down all Telemt processes.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for tag, st := range m.running {
		if st != nil && st.cancel != nil {
			st.cancel()
		}
		delete(m.running, tag)
	}
}

// Apply replaces running Telemt instances with the given payloads. Missing tags are stopped.
// Empty payloads stops every Telemt process managed by this Manager.
func (m *Manager) Apply(payloads []Payload) error {
	m.mu.Lock()
	if len(payloads) == 0 {
		for tag, st := range m.running {
			if st != nil && st.cancel != nil {
				st.cancel()
			}
			delete(m.running, tag)
		}
		m.mu.Unlock()
		m.commitReplaySnapshot(nil)
		return nil
	}
	m.mu.Unlock()

	bin := findTelemtBinary()
	if bin == "" {
		return errors.New("telemt binary not found (install to /app/bin/telemt or set TELEMT_BIN)")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	want := make(map[string]Payload)
	for _, p := range payloads {
		tag := strings.TrimSpace(p.Tag)
		if tag == "" {
			continue
		}
		want[tag] = p
	}

	// Stop removed tags
	for tag, st := range m.running {
		if _, ok := want[tag]; !ok {
			if st != nil && st.cancel != nil {
				st.cancel()
			}
			delete(m.running, tag)
		}
	}

	for tag, p := range want {
		toml := p.Toml
		h := sha256.Sum256([]byte(toml))
		hhex := hex.EncodeToString(h[:])
		if cur, ok := m.running[tag]; ok && cur != nil && cur.hash == hhex {
			continue
		}
		if cur, ok := m.running[tag]; ok && cur != nil && cur.cancel != nil {
			cur.cancel()
			delete(m.running, tag)
		}

		root := m.stateDirForTag(tag)
		if err := os.MkdirAll(filepath.Join(root, "tlsfront"), 0o755); err != nil {
			return fmt.Errorf("telemt mkdir %s: %w", root, err)
		}
		cfgPath := filepath.Join(root, "config.toml")
		if err := os.WriteFile(cfgPath, []byte(toml), 0o600); err != nil {
			return fmt.Errorf("telemt write %s: %w", cfgPath, err)
		}

		ctx, cancel := context.WithCancel(context.Background())
		cmd := exec.CommandContext(ctx, bin, cfgPath)
		cmd.Dir = root
		cmd.Env = os.Environ()
		tagSink := io.MultiWriter(os.Stderr, m.logWriter().PrefixWriter("["+tag+"] "))
		cmd.Stdout = tagSink
		cmd.Stderr = tagSink
		if err := cmd.Start(); err != nil {
			cancel()
			return fmt.Errorf("telemt start %s: %w", tag, err)
		}
		logger.Infof("Telemt started: tag=%s pid=%d", tag, cmd.Process.Pid)
		go func(tag string, cmd *exec.Cmd, waitCtx context.Context) {
			err := cmd.Wait()
			if err != nil && waitCtx.Err() == nil {
				logger.Warningf("Telemt exited: tag=%s err=%v", tag, err)
			}
		}(tag, cmd, ctx)

		m.running[tag] = &procState{cancel: cancel, hash: hhex}
	}

	m.commitReplaySnapshot(payloads)
	return nil
}
