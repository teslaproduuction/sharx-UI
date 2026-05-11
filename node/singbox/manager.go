// Package singbox supervises the hiddify-sing-box singleton sidecar on the SharX node.
//
// Pattern is different from node/telemt (multi-instance, one process per inbound):
// sing-box is a singleton — a single process holds the aggregated config for ALL
// mieru/AnyTLS/Naive/TUIC inbounds plus all sing-box outbound bridges (Phase 3).
// The panel always pushes a single fully-rendered config blob; we hash it, write it
// to /app/singbox/config.json, and either start the process (first apply) or send
// SIGHUP for a graceful reload (subsequent applies). SIGHUP closes existing
// connections — see batch-reload pattern in master-plan v3.2 — but we cannot avoid
// it without forking sing-box, so we accept it.
//
// See .agent/plans/phase-2-singbox-inbound.md and .agent/protocols/singbox.md.
package singbox

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
)

// Payload is the single sing-box config blob produced by the panel for this node.
// Mirrors the shape used by node/telemt.Payload to keep the apply-config envelope
// consistent across sidecars.
type Payload struct {
	Cfg        string `json:"cfg"`        // aggregated sing-box JSON config
	ConfigHash string `json:"configHash"` // sha256 of Cfg (panel computes; node verifies)
}

// Manager owns at most one sing-box child process at a time.
type Manager struct {
	mu       sync.Mutex
	cmd      *exec.Cmd
	pid      int
	cfgHash  string
	workRoot string // /app/singbox by default

	// Replay snapshot for /restart-singbox after a successful Apply.
	replayMu sync.RWMutex
	replayOK bool
	replay   Payload
}

// NewManager returns an empty manager; the process is started lazily on first Apply.
func NewManager() *Manager {
	return &Manager{}
}

// SetWorkRoot overrides the default /app/singbox directory (used by tests / panel
// running standalone where the path lives under XUI_DATA_FOLDER).
func (m *Manager) SetWorkRoot(abs string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.workRoot = strings.TrimSpace(abs)
}

func (m *Manager) workDir() string {
	if root := strings.TrimSpace(m.workRoot); root != "" {
		return root
	}
	if root := strings.TrimSpace(os.Getenv("SINGBOX_WORK_ROOT")); root != "" {
		return root
	}
	return "/app/singbox"
}

func findBinary() string {
	if p := strings.TrimSpace(os.Getenv("SINGBOX_BIN")); p != "" {
		return p
	}
	for _, c := range []string{"/app/bin/sing-box", "bin/sing-box", "./bin/sing-box"} {
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c
		}
	}
	return ""
}

// RunningCount returns 1 if the sidecar is alive, 0 otherwise.
// (Telemt-symmetric API so the node /status endpoint can format both sidecars uniformly.)
func (m *Manager) RunningCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.pid == 0 {
		return 0
	}
	// Cheap liveness probe: send signal 0 to the recorded pid.
	if err := syscall.Kill(m.pid, 0); err != nil {
		return 0
	}
	return 1
}

// ConfigHash returns the sha256 of the last-applied config (empty before first Apply).
func (m *Manager) ConfigHash() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.cfgHash
}

// ReplaySnapshotForRestart returns the most recent successful payload for the
// /restart-singbox endpoint. Mirrors node/telemt.ReplaySnapshotForRestart.
func (m *Manager) ReplaySnapshotForRestart() (Payload, bool) {
	if m == nil {
		return Payload{}, false
	}
	m.replayMu.RLock()
	defer m.replayMu.RUnlock()
	return m.replay, m.replayOK
}

func (m *Manager) commitReplay(p Payload) {
	m.replayMu.Lock()
	m.replay = p
	m.replayOK = true
	m.replayMu.Unlock()
}

// Stop terminates the sing-box child if running.
func (m *Manager) Stop() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopLocked()
}

func (m *Manager) stopLocked() {
	if m.cmd == nil || m.cmd.Process == nil {
		m.cmd = nil
		m.pid = 0
		m.cfgHash = ""
		return
	}
	pid := m.cmd.Process.Pid
	if err := m.cmd.Process.Signal(syscall.SIGTERM); err == nil {
		// Best-effort wait; if it does not exit in 5s we send SIGKILL.
		done := make(chan struct{})
		go func() {
			_ = m.cmd.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			_ = m.cmd.Process.Kill()
			<-done
		}
	}
	logger.Infof("singbox: stopped pid=%d", pid)
	m.cmd = nil
	m.pid = 0
	m.cfgHash = ""
}

// Apply reconciles the sing-box process to match the supplied payload.
//   - empty Cfg: stop the process if running, no-op otherwise.
//   - new hash, no process: write config and exec the binary.
//   - new hash, process running: write config and SIGHUP for graceful reload.
//   - same hash: no-op.
func (m *Manager) Apply(p Payload) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cfg := p.Cfg
	if strings.TrimSpace(cfg) == "" {
		m.stopLocked()
		m.commitReplay(Payload{})
		return nil
	}

	// Verify hash (panel computes — keep node honest if the wire flipped a bit).
	sum := sha256.Sum256([]byte(cfg))
	hhex := hex.EncodeToString(sum[:])
	if p.ConfigHash != "" && p.ConfigHash != hhex {
		return fmt.Errorf("singbox: configHash mismatch: payload=%s computed=%s", p.ConfigHash, hhex)
	}

	if m.pid != 0 && m.cfgHash == hhex {
		// Already running with this exact config — nothing to do.
		m.commitReplay(p)
		return nil
	}

	bin := findBinary()
	if bin == "" {
		return errors.New("singbox: binary not found (set SINGBOX_BIN or install to /app/bin/sing-box)")
	}

	root := m.workDir()
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fmt.Errorf("singbox: mkdir %s: %w", root, err)
	}
	cfgPath := filepath.Join(root, "config.json")
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o600); err != nil {
		return fmt.Errorf("singbox: write %s: %w", cfgPath, err)
	}

	if m.pid == 0 {
		// First start.
		cmd := exec.Command(bin, "run", "-c", cfgPath)
		cmd.Dir = root
		cmd.Env = os.Environ()
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
		if err := cmd.Start(); err != nil {
			return fmt.Errorf("singbox: start: %w", err)
		}
		m.cmd = cmd
		m.pid = cmd.Process.Pid
		m.cfgHash = hhex
		logger.Infof("singbox: started pid=%d cfgHash=%s***", m.pid, hhex[:8])
		go func(c *exec.Cmd, pid int) {
			err := c.Wait()
			// Wait may return nil on graceful exit (Stop) — only log the abnormal case.
			m.mu.Lock()
			stillOurs := m.pid == pid
			m.mu.Unlock()
			if err != nil && stillOurs {
				logger.Warningf("singbox: process exited unexpectedly pid=%d err=%v", pid, err)
				m.mu.Lock()
				m.cmd = nil
				m.pid = 0
				m.cfgHash = ""
				m.mu.Unlock()
			}
		}(cmd, m.pid)
		m.commitReplay(p)
		return nil
	}

	// Hot reload — SIGHUP on a running sing-box rereads config.json.
	// Connection breakage is documented in master-plan v3.2 ("Принятые компромиссы B").
	if err := syscall.Kill(m.pid, syscall.SIGHUP); err != nil {
		return fmt.Errorf("singbox: SIGHUP pid=%d: %w", m.pid, err)
	}
	m.cfgHash = hhex
	logger.Infof("singbox: SIGHUP reload pid=%d cfgHash=%s***", m.pid, hhex[:8])
	m.commitReplay(p)
	return nil
}
