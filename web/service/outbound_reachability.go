// Phase 4 — outbound reachability test.
//
// MVP: TCP connect to the outbound's target host:port and measure latency.
// Does NOT exercise the full protocol stack (no TLS handshake / no app-layer
// probe), so a green dot only proves the network path is open — auth/cert
// issues will surface only when real traffic flows through. The full-stack
// observatory probe is the canonical "is this member alive" signal and is
// already running via routing.balancers; this is meant for ad-hoc UI checks.
//
// Source = the panel host. Per-node testing would require pushing the dial
// request to each worker via the node API; deferred until there's demand.
package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/database/model"
)

// OutboundTestResult is one TCP probe outcome from one source.
type OutboundTestResult struct {
	Source    string `json:"source"`            // "panel" or "node-<id>"
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
}

// TestOutbound returns reachability of an outbound's target endpoint from the
// panel host. Extracts host:port from Settings JSON per protocol family.
func TestOutbound(ob *model.Outbound, timeoutMs int) (*OutboundTestResult, error) {
	if ob == nil {
		return nil, errors.New("nil outbound")
	}
	host, port, err := outboundTargetHostPort(ob)
	if err != nil {
		return &OutboundTestResult{Source: "panel", OK: false, Error: err.Error()}, nil
	}
	if timeoutMs <= 0 {
		timeoutMs = 4000
	}
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	start := time.Now()
	conn, err := net.DialTimeout("tcp", addr, time.Duration(timeoutMs)*time.Millisecond)
	lat := time.Since(start).Milliseconds()
	if err != nil {
		return &OutboundTestResult{Source: "panel", OK: false, LatencyMs: lat, Error: err.Error()}, nil
	}
	_ = conn.Close()
	return &OutboundTestResult{Source: "panel", OK: true, LatencyMs: lat}, nil
}

// outboundTargetHostPort digs the first server.address + server.port out of
// the Settings JSON. Knows the common Xray layouts: vless/vmess use vnext[],
// trojan/ss/socks/http use servers[]. Auto-created sidecar bridges use the
// same shape ({"servers":[{"address":"127.0.0.1","port":N}]}).
func outboundTargetHostPort(ob *model.Outbound) (string, int, error) {
	s := strings.TrimSpace(ob.Settings)
	if s == "" {
		return "", 0, errors.New("empty settings")
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(s), &raw); err != nil {
		return "", 0, fmt.Errorf("settings json: %w", err)
	}
	// Try vnext[] (vless/vmess).
	if vn, ok := raw["vnext"].([]any); ok && len(vn) > 0 {
		if first, ok := vn[0].(map[string]any); ok {
			return mapHostPort(first)
		}
	}
	// Try servers[] (trojan/ss/socks/http).
	if srv, ok := raw["servers"].([]any); ok && len(srv) > 0 {
		if first, ok := srv[0].(map[string]any); ok {
			return mapHostPort(first)
		}
	}
	// Wireguard endpoint peers[].
	if peers, ok := raw["peers"].([]any); ok && len(peers) > 0 {
		if first, ok := peers[0].(map[string]any); ok {
			return mapHostPort(first)
		}
	}
	return "", 0, errors.New("could not find target host:port in settings")
}

func mapHostPort(m map[string]any) (string, int, error) {
	host, _ := m["address"].(string)
	port := 0
	switch v := m["port"].(type) {
	case float64:
		port = int(v)
	case int:
		port = v
	case string:
		port, _ = strconv.Atoi(v)
	}
	if host == "" || port <= 0 {
		return "", 0, errors.New("missing address or port")
	}
	return host, port, nil
}
