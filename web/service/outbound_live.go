// Live outbound connectivity test — fetch a generate_204 URL *through* the
// outbound and report latency or the failure. Unlike TestOutbound (a bare TCP
// connect to the target), this exercises the real proxy path for SOCKS / HTTP
// outbounds (including the local 127.0.0.1 bridges that sidecars expose). For
// protocols we can't dial directly from Go (vless/vmess/trojan/wireguard) it
// falls back to the TCP reachability probe and says so.
package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/database/model"
	"golang.org/x/net/proxy"
)

// generate_204 endpoints (HTTP — no TLS so it works cleanly through a SOCKS dialer).
var probe204URLs = []string{
	"http://cp.cloudflare.com/generate_204",
	"http://www.gstatic.com/generate_204",
}

// OutboundLiveResult is one live-probe outcome.
type OutboundLiveResult struct {
	OK        bool   `json:"ok"`
	Mode      string `json:"mode"`            // "204" (through proxy) | "tcp" (fallback)
	Status    int    `json:"status,omitempty"`
	LatencyMs int64  `json:"latencyMs"`
	Error     string `json:"error,omitempty"`
}

// TestOutboundLive runs a generate_204 probe through the outbound when it is a
// SOCKS/HTTP proxy; otherwise falls back to the TCP reachability probe.
func TestOutboundLive(ob *model.Outbound, timeoutMs int) *OutboundLiveResult {
	if ob == nil {
		return &OutboundLiveResult{OK: false, Mode: "204", Error: "nil outbound"}
	}
	if timeoutMs <= 0 {
		timeoutMs = 6000
	}
	proto := strings.ToLower(strings.TrimSpace(ob.Protocol))

	host, port, user, pass, perr := socksOrHTTPTarget(ob)
	switch proto {
	case "socks":
		if perr == nil {
			return probe204ViaSOCKS(host, port, user, pass, timeoutMs)
		}
	case "http":
		if perr == nil {
			return probe204ViaHTTP(host, port, user, pass, timeoutMs)
		}
	}

	// Fallback: TCP reachability with a note (we can't speak vless/vmess/etc from Go).
	tcp, _ := TestOutbound(ob, timeoutMs)
	if tcp == nil {
		return &OutboundLiveResult{OK: false, Mode: "tcp", Error: "no result"}
	}
	res := &OutboundLiveResult{OK: tcp.OK, Mode: "tcp", LatencyMs: tcp.LatencyMs, Error: tcp.Error}
	if res.OK && res.Error == "" {
		res.Error = "TCP reach only (protocol can't be proxy-probed from the panel)"
	}
	return res
}

func probe204ViaSOCKS(host string, port int, user, pass string, timeoutMs int) *OutboundLiveResult {
	addr := net.JoinHostPort(host, strconv.Itoa(port))
	var auth *proxy.Auth
	if user != "" || pass != "" {
		auth = &proxy.Auth{User: user, Password: pass}
	}
	dialer, err := proxy.SOCKS5("tcp", addr, auth, proxy.Direct)
	if err != nil {
		return &OutboundLiveResult{OK: false, Mode: "204", Error: "socks dialer: " + err.Error()}
	}
	tr := &http.Transport{
		DialContext: func(_ context.Context, network, address string) (net.Conn, error) {
			return dialer.Dial(network, address)
		},
		DisableKeepAlives: true,
	}
	return runProbe204(tr, timeoutMs)
}

func probe204ViaHTTP(host string, port int, user, pass string, timeoutMs int) *OutboundLiveResult {
	u := &url.URL{Scheme: "http", Host: net.JoinHostPort(host, strconv.Itoa(port))}
	if user != "" || pass != "" {
		u.User = url.UserPassword(user, pass)
	}
	tr := &http.Transport{Proxy: http.ProxyURL(u), DisableKeepAlives: true}
	return runProbe204(tr, timeoutMs)
}

func runProbe204(tr *http.Transport, timeoutMs int) *OutboundLiveResult {
	client := &http.Client{
		Transport: tr,
		Timeout:   time.Duration(timeoutMs) * time.Millisecond,
		// Don't follow redirects — a 204 is the success signal.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	var lastErr string
	for _, target := range probe204URLs {
		start := time.Now()
		resp, err := client.Get(target)
		lat := time.Since(start).Milliseconds()
		if err != nil {
			lastErr = err.Error()
			continue
		}
		status := resp.StatusCode
		resp.Body.Close()
		ok := status == http.StatusNoContent || status == http.StatusOK
		return &OutboundLiveResult{OK: ok, Mode: "204", Status: status, LatencyMs: lat,
			Error: func() string {
				if ok {
					return ""
				}
				return fmt.Sprintf("unexpected status %d", status)
			}()}
	}
	return &OutboundLiveResult{OK: false, Mode: "204", Error: lastErr}
}

// socksOrHTTPTarget pulls servers[0] address/port (+ first user/pass) from a
// socks/http outbound's Settings JSON.
func socksOrHTTPTarget(ob *model.Outbound) (host string, port int, user, pass string, err error) {
	var raw map[string]any
	if e := json.Unmarshal([]byte(strings.TrimSpace(ob.Settings)), &raw); e != nil {
		return "", 0, "", "", fmt.Errorf("settings json: %w", e)
	}
	srv, ok := raw["servers"].([]any)
	if !ok || len(srv) == 0 {
		return "", 0, "", "", fmt.Errorf("no servers[]")
	}
	m, ok := srv[0].(map[string]any)
	if !ok {
		return "", 0, "", "", fmt.Errorf("bad server entry")
	}
	host, _ = m["address"].(string)
	switch v := m["port"].(type) {
	case float64:
		port = int(v)
	case int:
		port = v
	case string:
		port, _ = strconv.Atoi(v)
	}
	if users, ok := m["users"].([]any); ok && len(users) > 0 {
		if u0, ok := users[0].(map[string]any); ok {
			user, _ = u0["user"].(string)
			pass, _ = u0["pass"].(string)
		}
	}
	if host == "" || port <= 0 {
		return "", 0, "", "", fmt.Errorf("missing address or port")
	}
	return host, port, user, pass, nil
}
