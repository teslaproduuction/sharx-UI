package telemt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/pelletier/go-toml/v2"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

// HasRunning reports whether any Telemt child process is supervised.
func (m *Manager) HasRunning() bool {
	if m == nil {
		return false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.running) > 0
}

type telemtUserDetail struct {
	Username             string   `json:"username"`
	CurrentConnections   uint64   `json:"current_connections"`
	ActiveUniqueIPsList  []string `json:"active_unique_ips_list"`
	RecentUniqueIPsList  []string `json:"recent_unique_ips_list"`
}

// CollectOnlineSessionsForUser queries each running Telemt Control API for this username (panel client email).
func (m *Manager) CollectOnlineSessionsForUser(username string) []xray.OnlineIPSession {
	username = strings.TrimSpace(username)
	if username == "" || m == nil {
		return nil
	}
	m.mu.Lock()
	tags := make([]string, 0, len(m.running))
	for t := range m.running {
		if strings.TrimSpace(t) != "" {
			tags = append(tags, t)
		}
	}
	m.mu.Unlock()
	if len(tags) == 0 {
		return nil
	}

	now := time.Now().Unix()
	var out []xray.OnlineIPSession

	for _, tag := range tags {
		root := m.stateDirForTag(tag)
		cfgPath := filepath.Join(root, "config.toml")
		b, err := os.ReadFile(cfgPath)
		if err != nil {
			continue
		}
		var doc telemtTomlRoot
		if err := toml.Unmarshal(b, &doc); err != nil {
			logger.Debugf("telemt sessions: %s: parse config: %v", tag, err)
			continue
		}
		if !doc.Server.API.Enabled {
			continue
		}
		listen := strings.TrimSpace(doc.Server.API.Listen)
		if listen == "" {
			continue
		}
		host, port, err := net.SplitHostPort(listen)
		if err != nil {
			logger.Debugf("telemt sessions: %s: invalid api listen %q", tag, listen)
			continue
		}
		baseURL := "http://" + net.JoinHostPort(host, port)

		info, err := fetchTelemtUserDetail(baseURL, strings.TrimSpace(doc.Server.API.AuthHeader), username)
		if err != nil || info == nil {
			continue
		}
		if info.CurrentConnections == 0 && len(info.ActiveUniqueIPsList) == 0 && len(info.RecentUniqueIPsList) == 0 {
			continue
		}

		seenIP := make(map[string]struct{})
		for _, list := range [][]string{info.ActiveUniqueIPsList, info.RecentUniqueIPsList} {
			for _, raw := range list {
				ip := strings.TrimSpace(raw)
				if ip == "" {
					continue
				}
				k := strings.ToLower(ip)
				if _, ok := seenIP[k]; ok {
					continue
				}
				seenIP[k] = struct{}{}
				out = append(out, xray.OnlineIPSession{
					IP:       ip,
					LastSeen: now,
					Protocol: "mtproto",
					Remark:   tag,
				})
			}
		}
		if len(seenIP) == 0 && info.CurrentConnections > 0 {
			out = append(out, xray.OnlineIPSession{
				IP:       "",
				LastSeen: now,
				Protocol: "mtproto",
				Remark:   fmt.Sprintf("%s · %d tcp", tag, info.CurrentConnections),
			})
		}
	}
	return out
}

func fetchTelemtUserDetail(baseURL, authHeader, username string) (*telemtUserDetail, error) {
	u := strings.TrimRight(baseURL, "/") + "/v1/users/" + url.PathEscape(username)
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", u, strings.TrimSpace(string(body)))
	}
	var env struct {
		OK   bool            `json:"ok"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &env); err != nil {
		return nil, fmt.Errorf("decode envelope: %w", err)
	}
	if !env.OK {
		return nil, fmt.Errorf("telemt api: %s", strings.TrimSpace(string(body)))
	}
	var detail telemtUserDetail
	if err := json.Unmarshal(env.Data, &detail); err != nil {
		return nil, fmt.Errorf("decode user: %w", err)
	}
	return &detail, nil
}
