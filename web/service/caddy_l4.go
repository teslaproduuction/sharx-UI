package service

// Phase 11 — Caddy layer4 SNI router management.
//
// When settings.sniRouting443 is on, the Caddy container (network_mode: host,
// caddy-l4 plugin built in) owns :443 as a layer-4 SNI router: it peeks the TLS
// ClientHello server_name and forwards (TLS passthrough — backends keep their own
// certs) to the matching inbound's 127.0.0.1:<port>. Unmatched SNI / the panel
// domain fall through to the Caddy HTTP server on the internal port (default
// 8443), which serves the panel + decoy.
//
// The panel pushes the layer4 server config to Caddy's admin API. Both panel and
// Caddy run on host network, so the admin endpoint 127.0.0.1:2019 is shared.
//
// UDP protocols (Hysteria2/TUIC) are NOT handled here — they bind :443/udp
// directly (different transport, no TCP-443 conflict).
import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
)

// caddyAdminBase is the Caddy admin API root (override via CADDY_ADMIN env).
func caddyAdminBase() string {
	if v := strings.TrimSpace(os.Getenv("CADDY_ADMIN")); v != "" {
		return strings.TrimRight(v, "/")
	}
	return "http://127.0.0.1:2019"
}

// panelHTTPFallbackPort is where the Caddy HTTP server listens when the l4 router
// owns :443 (default route target). Override via CADDY_HTTP_PORT.
func panelHTTPFallbackPort() string {
	if v := strings.TrimSpace(os.Getenv("CADDY_HTTP_PORT")); v != "" {
		return v
	}
	return "8443"
}

const caddyL4ServerName = "sni443"

// SniRoute is one SNI→backend mapping surfaced to the UI overview.
type SniRoute struct {
	InboundID int    `json:"inboundId"`
	Tag       string `json:"tag"`
	Protocol  string `json:"protocol"`
	Sni       string `json:"sni"`
	Dial      string `json:"dial"`
}

// inboundSni returns the routing SNI for an inbound: the explicit Sni field, or
// the TLS serverName parsed from streamSettings (xray) / settings (sing-box).
func inboundSni(inb *model.Inbound) string {
	if s := strings.TrimSpace(inb.Sni); s != "" {
		return s
	}
	// xray: streamSettings.tlsSettings.serverName / realitySettings.serverNames[0]
	if raw := strings.TrimSpace(inb.StreamSettings); raw != "" {
		var ss map[string]any
		if json.Unmarshal([]byte(raw), &ss) == nil {
			if tls, ok := ss["tlsSettings"].(map[string]any); ok {
				if sn, _ := tls["serverName"].(string); strings.TrimSpace(sn) != "" {
					return strings.TrimSpace(sn)
				}
			}
			if rl, ok := ss["realitySettings"].(map[string]any); ok {
				if arr, ok := rl["serverNames"].([]any); ok && len(arr) > 0 {
					if s, _ := arr[0].(string); strings.TrimSpace(s) != "" {
						return strings.TrimSpace(s)
					}
				}
			}
		}
	}
	// sing-box: settings.tls.server_name
	if raw := strings.TrimSpace(inb.Settings); raw != "" {
		var st map[string]any
		if json.Unmarshal([]byte(raw), &st) == nil {
			if tls, ok := st["tls"].(map[string]any); ok {
				if sn, _ := tls["server_name"].(string); strings.TrimSpace(sn) != "" {
					return strings.TrimSpace(sn)
				}
			}
		}
	}
	return ""
}

// CollectSniRoutes returns the SNI→backend routes for all enabled, TCP/TLS
// inbounds flagged share_tls_443 with a resolvable SNI.
func CollectSniRoutes() ([]SniRoute, error) {
	db := database.GetDB()
	var inbounds []model.Inbound
	if err := db.Where("enable = ? AND share_tls_443 = ?", true, true).Find(&inbounds).Error; err != nil {
		return nil, err
	}
	out := make([]SniRoute, 0, len(inbounds))
	for i := range inbounds {
		inb := &inbounds[i]
		// UDP protocols bind :443/udp themselves — never go through the TCP l4 router.
		if p := model.NormalizeProtocol(inb.Protocol); p == "hysteria2" || p == model.TUIC {
			continue
		}
		sni := inboundSni(inb)
		if sni == "" || inb.Port <= 0 {
			continue
		}
		out = append(out, SniRoute{
			InboundID: inb.Id,
			Tag:       inb.Tag,
			Protocol:  string(inb.Protocol),
			Sni:       sni,
			Dial:      fmt.Sprintf("127.0.0.1:%d", inb.Port),
		})
	}
	return out, nil
}

// buildLayer4Server renders the caddy-l4 server JSON: one route per SNI plus a
// default route forwarding unmatched traffic to the panel HTTP server.
func buildLayer4Server(routes []SniRoute) map[string]any {
	caddyRoutes := make([]map[string]any, 0, len(routes)+1)
	for _, r := range routes {
		caddyRoutes = append(caddyRoutes, map[string]any{
			"match": []map[string]any{{"tls": map[string]any{"sni": []string{r.Sni}}}},
			"handle": []map[string]any{{
				"handler":   "proxy",
				"upstreams": []map[string]any{{"dial": []string{r.Dial}}},
			}},
		})
	}
	// Default route (no match) → panel HTTP/decoy.
	caddyRoutes = append(caddyRoutes, map[string]any{
		"handle": []map[string]any{{
			"handler":   "proxy",
			"upstreams": []map[string]any{{"dial": []string{"127.0.0.1:" + panelHTTPFallbackPort()}}},
		}},
	})
	return map[string]any{
		"listen": []string{":443"},
		"routes": caddyRoutes,
	}
}

// PushLayer4ToCaddy syncs the layer4 server to Caddy's admin API. When
// sniRouting443 is off it removes the server (best-effort). Safe to call on every
// inbound mutation; no-ops cleanly when Caddy admin is unreachable (logs only).
func PushLayer4ToCaddy() {
	ss := SettingService{}
	enabled, _ := ss.GetSniRouting443()
	base := caddyAdminBase()
	client := &http.Client{Timeout: 5 * time.Second}

	if !enabled {
		req, _ := http.NewRequest(http.MethodDelete, base+"/config/apps/layer4/servers/"+caddyL4ServerName, nil)
		if resp, err := client.Do(req); err == nil {
			resp.Body.Close()
		}
		return
	}

	routes, err := CollectSniRoutes()
	if err != nil {
		logger.Warningf("caddy l4: collect routes: %v", err)
		return
	}
	server := buildLayer4Server(routes)
	body, _ := json.Marshal(server)

	// PUT the whole server object (creates the layer4 app path if absent on first
	// push because Caddy auto-creates intermediate config nodes).
	req, _ := http.NewRequest(http.MethodPut, base+"/config/apps/layer4/servers/"+caddyL4ServerName, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		logger.Warningf("caddy l4: push to admin %s failed: %v", base, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		buf := new(bytes.Buffer)
		buf.ReadFrom(resp.Body)
		logger.Warningf("caddy l4: admin returned %d: %s", resp.StatusCode, strings.TrimSpace(buf.String()))
		return
	}
	logger.Infof("caddy l4: synced %d SNI route(s) on :443", len(routes))
}
