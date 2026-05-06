package telemt

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/pelletier/go-toml/v2"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

const telemtOctetsSnapshotFile = "sharx_telemt_octets.json"

type telemtTomlRoot struct {
	Server struct {
		API struct {
			Enabled    bool   `toml:"enabled"`
			Listen     string `toml:"listen"`
			AuthHeader string `toml:"auth_header"`
		} `toml:"api"`
	} `toml:"server"`
}

type octetsSnapshot struct {
	Users map[string]uint64 `json:"users"`
}

// MergeTelemtIntoNodeStats polls each running Telemt instance (localhost API) and merges
// per-user octet deltas into traffic / clientTraffic. Snapshots are persisted under the
// instance state dir to derive deltas from cumulative Telemt counters.
func (m *Manager) MergeTelemtIntoNodeStats(traffic *[]*xray.Traffic, clientTraffic *[]*xray.ClientTraffic, onlineClients *[]string) {
	if m == nil || clientTraffic == nil {
		return
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
		return
	}

	var onlineMu sync.Mutex
	onlineAdded := map[string]struct{}{}
	if onlineClients != nil {
		for _, e := range *onlineClients {
			k := strings.ToLower(strings.TrimSpace(e))
			if k != "" {
				onlineAdded[k] = struct{}{}
			}
		}
	}
	addOnline := func(email string) {
		if onlineClients == nil {
			return
		}
		email = strings.TrimSpace(email)
		if email == "" {
			return
		}
		k := strings.ToLower(email)
		onlineMu.Lock()
		defer onlineMu.Unlock()
		if _, ok := onlineAdded[k]; ok {
			return
		}
		onlineAdded[k] = struct{}{}
		*onlineClients = append(*onlineClients, email)
	}

	clientIdx := map[string]int{}
	if clientTraffic != nil {
		for i, ct := range *clientTraffic {
			if ct == nil {
				continue
			}
			em := strings.ToLower(strings.TrimSpace(ct.Email))
			if em != "" {
				clientIdx[em] = i
			}
		}
	}

	for _, tag := range tags {
		root := m.stateDirForTag(tag)
		cfgPath := filepath.Join(root, "config.toml")
		b, err := os.ReadFile(cfgPath)
		if err != nil {
			continue
		}
		var doc telemtTomlRoot
		if err := toml.Unmarshal(b, &doc); err != nil {
			logger.Debugf("telemt stats: %s: parse config: %v", tag, err)
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
			logger.Debugf("telemt stats: %s: invalid api listen %q", tag, listen)
			continue
		}
		baseURL := "http://" + net.JoinHostPort(host, port)

		users, err := fetchTelemtUsersJSON(baseURL, strings.TrimSpace(doc.Server.API.AuthHeader))
		if err != nil {
			logger.Debugf("telemt stats: %s: %v", tag, err)
			continue
		}

		snapPath := filepath.Join(root, telemtOctetsSnapshotFile)
		prev := loadOctetsSnapshot(snapPath)
		if prev.Users == nil {
			prev.Users = make(map[string]uint64)
		}

		var tagTotal int64
		next := octetsSnapshot{Users: make(map[string]uint64, len(users))}

		for _, u := range users {
			user := strings.TrimSpace(u.Username)
			if user == "" {
				continue
			}
			cur := u.TotalOctets
			next.Users[user] = cur

			old, hadOld := prev.Users[user]
			var delta uint64
			if !hadOld {
				delta = 0
			} else if cur >= old {
				delta = cur - old
			} else {
				// Counter reset (Telemt restart) — attribute current total as this tick.
				delta = cur
			}
			if u.CurrentConnections > 0 {
				addOnline(user)
			}
			if delta == 0 {
				continue
			}
			d := int64(delta)
			if d < 0 {
				continue
			}
			tagTotal += d

			// Xray-oriented traffic: Up ≈ download toward the user (server → client). MTProto
			// total_octets is bidirectional; we fold it into Up so AddClientTraffic maps it to client Down.
			if clientTraffic != nil {
				k := strings.ToLower(user)
				if i, ok := clientIdx[k]; ok {
					(*clientTraffic)[i].Up += d
				} else {
					clientIdx[k] = len(*clientTraffic)
					*clientTraffic = append(*clientTraffic, &xray.ClientTraffic{
						Email: user,
						Up:    d,
						Down:  0,
					})
				}
			}
		}

		// Persist users still in Telemt; drop removed users from snapshot.
		if err := saveOctetsSnapshot(snapPath, next); err != nil {
			logger.Debugf("telemt stats: %s: save snapshot: %v", tag, err)
		}

		if tagTotal > 0 && traffic != nil {
			*traffic = append(*traffic, &xray.Traffic{
				IsInbound:  true,
				IsOutbound: false,
				Tag:        tag,
				Up:         tagTotal,
				Down:       0,
			})
		}
	}
}

type telemtUserRow struct {
	Username           string `json:"username"`
	TotalOctets        uint64 `json:"total_octets"`
	CurrentConnections uint64 `json:"current_connections"`
}

func fetchTelemtUsersJSON(baseURL, authHeader string) ([]telemtUserRow, error) {
	u := strings.TrimRight(baseURL, "/") + "/v1/stats/users"
	ctx, cancel := contextWithTimeout(8 * time.Second)
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
		return nil, fmt.Errorf("telemt api error body: %s", strings.TrimSpace(string(body)))
	}
	var rows []telemtUserRow
	if err := json.Unmarshal(env.Data, &rows); err != nil {
		return nil, fmt.Errorf("decode users: %w", err)
	}
	return rows, nil
}

func contextWithTimeout(d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), d)
}

func loadOctetsSnapshot(path string) octetsSnapshot {
	b, err := os.ReadFile(path)
	if err != nil || len(b) == 0 {
		return octetsSnapshot{}
	}
	var s octetsSnapshot
	if json.Unmarshal(b, &s) != nil {
		return octetsSnapshot{}
	}
	return s
}

func saveOctetsSnapshot(path string, s octetsSnapshot) error {
	tmp := path + ".tmp"
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
