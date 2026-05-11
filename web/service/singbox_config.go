// Phase 2 — Aggregated sing-box (hiddify fork) config builder.
// Produces a single JSON config blob containing every mieru/AnyTLS/Naive/TUIC
// inbound (later: sing-box outbound bridges from Phase 3) for one node, then
// hashes it for the apply-config envelope.
//
// MVP: only the `mieru` inbound type is wired up. AnyTLS/Naive/TUIC will land
// in follow-up commits on this branch — the dispatcher in BuildSingboxConfigForNode
// is structured so adding them is "case model.AnyTLS: ..." and one builder fn.
//
// See .agent/plans/phase-2-singbox-inbound.md and .agent/protocols/singbox.md.
package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
)

// SingboxNodePayload is the single payload pushed to one node's apply-config envelope.
// Mirrors node/singbox.Payload field names so the JSON round-trip is implicit.
type SingboxNodePayload struct {
	Cfg        string `json:"cfg"`
	ConfigHash string `json:"configHash"`
}

// IsEmpty reports whether the payload would stop sing-box (no managed inbounds/outbounds).
func (p SingboxNodePayload) IsEmpty() bool { return strings.TrimSpace(p.Cfg) == "" }

// SingboxConfigService builds aggregated sing-box configs.
type SingboxConfigService struct {
	inboundService InboundService
	settingService SettingService
}

// BuildSingboxConfigStandalone aggregates every enabled sing-box-managed inbound
// in the panel-local DB into a single sing-box config blob (single-node mode).
func (s *SingboxConfigService) BuildSingboxConfigStandalone() (SingboxNodePayload, error) {
	inbounds, err := s.inboundService.GetAllInbounds()
	if err != nil {
		return SingboxNodePayload{}, fmt.Errorf("singbox: load inbounds: %w", err)
	}
	return s.buildFromInbounds(inbounds)
}

// BuildSingboxConfigForNode is the multi-node variant — same as standalone for now;
// future revision will filter by InboundNodeMapping when sing-box inbounds become
// node-assignable in the UI.
func (s *SingboxConfigService) BuildSingboxConfigForNode(nodeID int) (SingboxNodePayload, error) {
	// TODO Phase 4: filter inbounds by node assignment via InboundNodeMapping.
	return s.BuildSingboxConfigStandalone()
}

func (s *SingboxConfigService) buildFromInbounds(inbounds []*model.Inbound) (SingboxNodePayload, error) {
	v2rayPort := 62788
	if v, err := s.settingService.getString("singboxV2RayAPIPort"); err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && n > 0 {
			v2rayPort = n
		}
	}
	clashPort := 9090
	if v, err := s.settingService.getString("singboxClashAPIPort"); err == nil {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && n > 0 {
			clashPort = n
		}
	}
	clashSecret, _ := s.settingService.getString("singboxClashAPISecret")
	logLevel := "warn"
	if v, err := s.settingService.getString("singboxLogLevel"); err == nil && strings.TrimSpace(v) != "" {
		logLevel = v
	}

	// Collect inbound JSON fragments per protocol. Order is stable (sort by inbound id)
	// so the resulting hash is deterministic and we can skip no-op SIGHUPs.
	type sbxInbound struct {
		json json.RawMessage
		tag  string
		user string // primary user email (for v2ray_api stats subjects)
	}
	var collected []sbxInbound
	for _, inb := range inbounds {
		if inb == nil || !inb.Enable {
			continue
		}
		if !model.IsSingboxInboundProtocol(inb.Protocol) {
			continue
		}
		switch model.NormalizeProtocol(inb.Protocol) {
		case model.Mieru:
			frag, users, err := buildMieruInboundJSON(inb)
			if err != nil {
				logger.Warningf("singbox: skip inbound id=%d (mieru build error): %v", inb.Id, err)
				continue
			}
			collected = append(collected, sbxInbound{json: frag, tag: inb.Tag, user: firstUser(users)})
		default:
			// AnyTLS/Naive/TUIC — TODO follow-up commits.
			logger.Debugf("singbox: skipping inbound id=%d protocol=%s (not yet implemented)", inb.Id, inb.Protocol)
		}
	}

	if len(collected) == 0 {
		// Empty payload tells the node manager to stop sing-box.
		return SingboxNodePayload{}, nil
	}

	inboundsJSON := make([]json.RawMessage, 0, len(collected))
	statsInbounds := make([]string, 0, len(collected))
	statsUsers := make(map[string]bool)
	for _, c := range collected {
		inboundsJSON = append(inboundsJSON, c.json)
		statsInbounds = append(statsInbounds, c.tag)
		if c.user != "" {
			statsUsers[c.user] = true
		}
	}
	statsUserList := make([]string, 0, len(statsUsers))
	for u := range statsUsers {
		statsUserList = append(statsUserList, u)
	}

	cfg := map[string]any{
		"log": map[string]any{"level": logLevel, "timestamp": true},
		"experimental": map[string]any{
			"v2ray_api": map[string]any{
				"listen": fmt.Sprintf("127.0.0.1:%d", v2rayPort),
				"stats": map[string]any{
					"enabled":   true,
					"inbounds":  statsInbounds,
					"outbounds": []string{},
					"users":     statsUserList,
				},
			},
			"clash_api": map[string]any{
				"external_controller": fmt.Sprintf("127.0.0.1:%d", clashPort),
				"secret":              clashSecret,
			},
		},
		"inbounds":  inboundsJSON,
		"outbounds": []map[string]any{{"type": "direct", "tag": "direct"}, {"type": "block", "tag": "block"}},
		"route":     map[string]any{"final": "direct"},
	}

	out, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return SingboxNodePayload{}, fmt.Errorf("singbox: marshal cfg: %w", err)
	}
	sum := sha256.Sum256(out)
	return SingboxNodePayload{
		Cfg:        string(out),
		ConfigHash: hex.EncodeToString(sum[:]),
	}, nil
}

func firstUser(users []sbxUser) string {
	if len(users) == 0 {
		return ""
	}
	return users[0].Name
}

// sbxUser is the shape sing-box inbounds use for users. Different protocols vary
// the field names slightly (mieru: name+password; anytls: same; naive: username+password;
// tuic: name+uuid+password). Each builder normalizes its own form.
type sbxUser struct {
	Name     string `json:"name,omitempty"`
	Username string `json:"username,omitempty"`
	UUID     string `json:"uuid,omitempty"`
	Password string `json:"password,omitempty"`
}

// buildMieruInboundJSON renders one sing-box `mieru` inbound from a SharX inbound row.
//
// We intentionally only consume the fields the UI form already lets the admin set; everything
// else falls back to sane defaults documented in .agent/protocols/mieru.md.
//
// Settings JSON expected from the UI (subset of the existing inbound.Settings text):
//
//	{
//	  "transport": "TCP",          // or "UDP"; default TCP
//	  "multiplexing": "MULTIPLEXING_LOW",
//	  "mtu": 1400,
//	  "clients": [{"email": "alice", "password": "..."}, ...]
//	}
//
// The clients[].email becomes the v2ray_api stats subject (matches Xray pattern).
func buildMieruInboundJSON(inb *model.Inbound) (json.RawMessage, []sbxUser, error) {
	if inb == nil {
		return nil, nil, errors.New("nil inbound")
	}
	var raw map[string]any
	if err := json.Unmarshal([]byte(inb.Settings), &raw); err != nil {
		return nil, nil, fmt.Errorf("settings JSON: %w", err)
	}

	// Pull users via the canonical SharX path: ClientEntity rows assigned to this inbound.
	// For the mieru baseline we still also accept inline clients[] in settings so the API tests
	// can create an inbound + user in a single POST without going through ClientEntity yet.
	var users []sbxUser
	if cs, ok := raw["clients"].([]any); ok {
		for _, c := range cs {
			cm, ok := c.(map[string]any)
			if !ok {
				continue
			}
			email, _ := cm["email"].(string)
			pwd, _ := cm["password"].(string)
			if email == "" || pwd == "" {
				continue
			}
			users = append(users, sbxUser{Name: email, Password: pwd})
		}
	}
	if len(users) == 0 {
		return nil, nil, errors.New("no users (provide settings.clients[] with email+password)")
	}

	// hiddify-sing-box mieru schema (option/mieru.go):
	//   network: ["tcp"] | ["udp"] | ["tcp","udp"]   (NetworkList)
	//   users:  [{ username, password }]
	// `transport`, `multiplexing`, `mtu` from our SharX inbound settings JSON
	// are not valid sing-box mieru options — `multiplexing`/`mtu` live in the
	// MIERU CLIENT config, not server. We accept them in the panel form for
	// future client-config download (sub-page) but drop them here.
	network := []string{"tcp"}
	if v, ok := raw["transport"].(string); ok {
		switch strings.ToUpper(strings.TrimSpace(v)) {
		case "UDP":
			network = []string{"udp"}
		case "TCP+UDP", "BOTH":
			network = []string{"tcp", "udp"}
		}
	}
	if v, ok := raw["network"].([]any); ok {
		network = nil
		for _, n := range v {
			if s, ok := n.(string); ok && strings.TrimSpace(s) != "" {
				network = append(network, strings.ToLower(s))
			}
		}
	}

	listen := strings.TrimSpace(inb.Listen)
	if listen == "" {
		listen = "::"
	}

	tag := strings.TrimSpace(inb.Tag)
	if tag == "" {
		tag = fmt.Sprintf("mieru-in-%d", inb.Id)
	}

	// MieruUser uses `username` not `name`. Re-map.
	mieruUsers := make([]map[string]string, 0, len(users))
	for _, u := range users {
		mieruUsers = append(mieruUsers, map[string]string{
			"username": u.Name, // we collected as Name above; sing-box wants username
			"password": u.Password,
		})
	}

	// mieru requires explicit portBindings with the protocol per port; just listen_port
	// + network is rejected at validation time ("Transport of Server Port is not defined").
	portBindings := make([]map[string]any, 0, len(network))
	for _, n := range network {
		portBindings = append(portBindings, map[string]any{
			"port":     inb.Port,
			"protocol": strings.ToUpper(n),
		})
	}

	frag := map[string]any{
		"type":         "mieru",
		"tag":          tag,
		"listen":       listen,
		"listen_port":  inb.Port,
		"network":      network,
		"portBindings": portBindings,
		"users":        mieruUsers,
	}
	out, err := json.Marshal(frag)
	if err != nil {
		return nil, nil, err
	}
	return out, users, nil
}
