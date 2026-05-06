// Package telemt runs Telemt (MTProto) sidecar processes on the SharX node.
package telemt

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	"github.com/konstpic/sharx-code/v2/logger"
)

// Payload is one inbound worth of Telemt configuration (TOML file contents).
type Payload struct {
	InboundId int    `json:"inboundId"`
	Tag       string `json:"tag"`
	Toml      string `json:"toml"`
}

// Manager supervises one Telemt OS process per inbound tag.
type Manager struct {
	mu      sync.Mutex
	running map[string]*procState
}

type procState struct {
	cancel context.CancelFunc
	hash   string
}

// NewManager creates a Telemt manager.
func NewManager() *Manager {
	return &Manager{running: make(map[string]*procState)}
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

		root := filepath.Join("/app/telemt", tag)
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
		cmd.Stdout = os.Stderr
		cmd.Stderr = os.Stderr
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
	return nil
}
