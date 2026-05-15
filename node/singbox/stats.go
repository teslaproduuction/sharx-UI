// Stats puller for the hiddify-sing-box singleton sidecar.
//
// hiddify-fork patches the upstream v2ray_api StatsService to also emit per-user
// counters under the same key shape Xray uses (`user>>><email>>>traffic>>>uplink|downlink`)
// — see https://github.com/hiddify/hiddify-sing-box/blob/main/experimental/v2rayapi/stats.go.
// We reuse Xray's gRPC StatsServiceClient against 127.0.0.1:62788 (the port the panel
// writes into the aggregated config in web/service/singbox_config.go) and apply the
// exact same regex pair used by xray/api.go GetTraffic. Output shape is intentionally
// identical so the existing panel-side stats merger does not need protocol-specific
// branches.
package singbox

import (
	"context"
	"fmt"
	"regexp"
	"sync"
	"time"

	statsService "github.com/xtls/xray-core/app/stats/command"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// Default v2ray_api port — must mirror web/service/singbox_config.go's
// `singboxV2RayAPIPort` setting (defaults to 62788 there as well).
const defaultV2RayAPIPort = 62788

var (
	statsTrafficRegex       = regexp.MustCompile(`(inbound|outbound)>>>([^>]+)>>>traffic>>>(downlink|uplink)`)
	statsClientTrafficRegex = regexp.MustCompile(`user>>>([^>]+)>>>traffic>>>(downlink|uplink)`)
)

// Traffic mirrors xray.Traffic (kept local to avoid pulling the full xray pkg dep
// graph into the node-side singbox package). The panel-side merger casts/copies.
type Traffic struct {
	IsInbound  bool
	IsOutbound bool
	Tag        string
	Up         int64
	Down       int64
}

// ClientTraffic mirrors xray.ClientTraffic.
type ClientTraffic struct {
	Email string
	Up    int64
	Down  int64
}

// StatsClient is a thin gRPC wrapper around the StatsService exposed by
// hiddify-sing-box's v2ray_api experimental block. Connection is dialed lazily
// on first Query and held until the manager stops the process.
type StatsClient struct {
	mu     sync.Mutex
	port   int
	conn   *grpc.ClientConn
	client statsService.StatsServiceClient
}

// NewStatsClient returns a client that will dial 127.0.0.1:port lazily.
// port = 0 falls back to the default (62788).
func NewStatsClient(port int) *StatsClient {
	if port <= 0 {
		port = defaultV2RayAPIPort
	}
	return &StatsClient{port: port}
}

func (s *StatsClient) ensureConn() error {
	if s.client != nil {
		return nil
	}
	addr := fmt.Sprintf("127.0.0.1:%d", s.port)
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return fmt.Errorf("singbox stats: dial %s: %w", addr, err)
	}
	s.conn = conn
	s.client = statsService.NewStatsServiceClient(conn)
	return nil
}

// Close drops the gRPC connection. Safe to call when nothing was dialed yet.
func (s *StatsClient) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.conn != nil {
		_ = s.conn.Close()
		s.conn = nil
		s.client = nil
	}
}

// QueryStats fetches current per-tag and per-user counters. When reset is true,
// the sing-box side zeroes the counters after returning them (atomic delta read,
// same semantics as Xray's StatsService).
func (s *StatsClient) QueryStats(reset bool) ([]*Traffic, []*ClientTraffic, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.ensureConn(); err != nil {
		return nil, nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()
	resp, err := s.client.QueryStats(ctx, &statsService.QueryStatsRequest{Reset_: reset})
	if err != nil {
		return nil, nil, fmt.Errorf("singbox stats: QueryStats: %w", err)
	}

	tagMap := make(map[string]*Traffic)
	userMap := make(map[string]*ClientTraffic)
	for _, st := range resp.GetStat() {
		if m := statsTrafficRegex.FindStringSubmatch(st.Name); len(m) == 4 {
			isInbound := m[1] == "inbound"
			tag := m[2]
			if tag == "api" {
				continue
			}
			t, ok := tagMap[tag]
			if !ok {
				t = &Traffic{IsInbound: isInbound, IsOutbound: !isInbound, Tag: tag}
				tagMap[tag] = t
			}
			if m[3] == "downlink" {
				t.Down = st.Value
			} else {
				t.Up = st.Value
			}
		} else if m := statsClientTrafficRegex.FindStringSubmatch(st.Name); len(m) == 3 {
			email := m[1]
			ct, ok := userMap[email]
			if !ok {
				ct = &ClientTraffic{Email: email}
				userMap[email] = ct
			}
			if m[2] == "downlink" {
				ct.Down = st.Value
			} else {
				ct.Up = st.Value
			}
		}
	}
	tags := make([]*Traffic, 0, len(tagMap))
	for _, v := range tagMap {
		tags = append(tags, v)
	}
	users := make([]*ClientTraffic, 0, len(userMap))
	for _, v := range userMap {
		users = append(users, v)
	}
	return tags, users, nil
}
