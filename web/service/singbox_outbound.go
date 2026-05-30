// Phase 3 — sing-box client outbound builders.
//
// Each enabled OutboundSidecar contributes 3 sections to the singleton sing-box
// config blob produced by BuildSingboxConfigStandalone:
//
//   1. an "outbound" section (kind-specific: naive / anytls / mieru / tuic /
//      hy2) carrying the target server + auth + TLS;
//   2. a "mixed" inbound on 127.0.0.1:listen_port (the bridge clients dial
//      from the SharX node — Xray socks-out points here);
//   3. a route.rule that pins traffic from the bridge inbound to the matching
//      sidecar outbound (so multiple sidecars can coexist).
//
// The Xray socks-out side ("<name>-local" tagged) is auto-created in
// outbound_sidecar.go on every Create/Update so RoutingBuilder selects can
// address the cascade member by friendly name.
//
// See .agent/plans/phase-3-naive-outbound.md.
package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
)

// SingboxOutboundFragments is the multi-part contribution one sidecar makes
// to the aggregated config (outbound + bridge + route rule). The aggregator
// merges these slices across all sidecars before marshalling the final blob.
type SingboxOutboundFragments struct {
	Outbound      json.RawMessage
	BridgeInbound json.RawMessage
	RouteRule     json.RawMessage
	// IsEndpoint marks Outbound as a sing-box `endpoints[]` entry (WireGuard /
	// AmneziaWG) rather than an `outbounds[]` entry. sing-box 1.11+ moved
	// WireGuard from outbound to endpoint; routing to it by tag is unchanged.
	IsEndpoint bool
}

// BuildSingboxOutboundForSidecar dispatches by kind. Returns ErrKindNotSupported
// when the sidecar.kind is unknown — callers should skip + log.
// Exported so the HTTP "preview" handler can render fragments for a candidate
// sidecar payload before it is saved.
func BuildSingboxOutboundForSidecar(sc *model.OutboundSidecar) (SingboxOutboundFragments, error) {
	if sc == nil {
		return SingboxOutboundFragments{}, errors.New("nil sidecar")
	}
	if !sc.Enable {
		return SingboxOutboundFragments{}, nil
	}
	if sc.ListenPort <= 0 || sc.ListenPort > 65535 {
		return SingboxOutboundFragments{}, fmt.Errorf("sidecar id=%d has invalid listen_port %d", sc.Id, sc.ListenPort)
	}

	tag := strings.TrimSpace(sc.Name)
	if tag == "" {
		tag = fmt.Sprintf("sidecar-%d", sc.Id)
	}
	bridgeTag := "bridge-" + tag

	var raw map[string]any
	if err := json.Unmarshal([]byte(sc.ConfigJSON), &raw); err != nil {
		return SingboxOutboundFragments{}, fmt.Errorf("config_json: %w", err)
	}

	var ob map[string]any
	var err error
	switch strings.TrimSpace(sc.Kind) {
	case "naive_client":
		ob, err = buildNaiveClientOutbound(tag, raw)
	case "anytls_client":
		ob, err = buildAnyTLSClientOutbound(tag, raw)
	case "mieru_client":
		ob, err = buildMieruClientOutbound(tag, raw)
	case "tuic_client":
		ob, err = buildTUICClientOutbound(tag, raw)
	case "hy2_client":
		ob, err = buildHy2ClientOutbound(tag, raw)
	case "wireguard_client":
		ob, err = buildWireGuardClientOutbound(tag, raw)
	default:
		return SingboxOutboundFragments{}, fmt.Errorf("kind %q not implemented", sc.Kind)
	}
	if err != nil {
		return SingboxOutboundFragments{}, err
	}

	bridge := map[string]any{
		"type":        "mixed",
		"tag":         bridgeTag,
		"listen":      "127.0.0.1",
		"listen_port": sc.ListenPort,
	}
	rule := map[string]any{
		"inbound":  []string{bridgeTag},
		"outbound": tag,
	}

	obJSON, _ := json.Marshal(ob)
	bridgeJSON, _ := json.Marshal(bridge)
	ruleJSON, _ := json.Marshal(rule)
	return SingboxOutboundFragments{
		Outbound:      obJSON,
		BridgeInbound: bridgeJSON,
		RouteRule:     ruleJSON,
		// WireGuard/AmneziaWG is an endpoint in sing-box 1.11+.
		IsEndpoint: strings.TrimSpace(sc.Kind) == "wireguard_client",
	}, nil
}

// requireServer pulls server + server_port out of a kind-agnostic config map.
// All five client kinds share the same target shape.
func requireServer(raw map[string]any) (string, int, error) {
	server, _ := raw["server"].(string)
	if strings.TrimSpace(server) == "" {
		return "", 0, errors.New("server is required")
	}
	var port int
	switch v := raw["server_port"].(type) {
	case float64:
		port = int(v)
	case int:
		port = v
	}
	if port <= 0 || port > 65535 {
		return "", 0, fmt.Errorf("server_port %v invalid", raw["server_port"])
	}
	return server, port, nil
}

// outboundTLSBlock mirrors buildInboundTLS but for the client side: insecure
// + sni + alpn + (optional) certificate pinning. Returns nil when the kind
// does not need TLS at all (naive always does, mieru never).
func outboundTLSBlock(raw map[string]any) (map[string]any, error) {
	tlsRaw, ok := raw["tls"].(map[string]any)
	if !ok {
		return nil, nil
	}
	out := map[string]any{"enabled": true}
	if v, _ := tlsRaw["server_name"].(string); strings.TrimSpace(v) != "" {
		out["server_name"] = v
	}
	if v, ok := tlsRaw["alpn"].([]any); ok && len(v) > 0 {
		out["alpn"] = v
	} else if s, _ := tlsRaw["alpn"].(string); strings.TrimSpace(s) != "" {
		out["alpn"] = strings.Split(s, ",")
	}
	if v, ok := tlsRaw["insecure"].(bool); ok && v {
		out["insecure"] = true
	}
	if v, _ := tlsRaw["min_version"].(string); strings.TrimSpace(v) != "" {
		out["min_version"] = v
	}
	if v, _ := tlsRaw["certificate"].(string); strings.TrimSpace(v) != "" {
		out["certificate"] = strings.Split(v, "\n")
	}
	if v, _ := tlsRaw["certificate_path"].(string); strings.TrimSpace(v) != "" {
		out["certificate_path"] = v
	}
	return out, nil
}

func buildNaiveClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	username, _ := raw["username"].(string)
	password, _ := raw["password"].(string)
	if strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("naive_client needs username + password")
	}
	tls, err := outboundTLSBlock(raw)
	if err != nil {
		return nil, err
	}
	if tls == nil {
		tls = map[string]any{"enabled": true}
	}
	out := map[string]any{
		"type":        "naive",
		"tag":         tag,
		"server":      server,
		"server_port": port,
		"username":    username,
		"password":    password,
		"tls":         tls,
	}
	return out, nil
}

func buildAnyTLSClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	password, _ := raw["password"].(string)
	if strings.TrimSpace(password) == "" {
		return nil, errors.New("anytls_client needs password")
	}
	tls, err := outboundTLSBlock(raw)
	if err != nil {
		return nil, err
	}
	if tls == nil {
		tls = map[string]any{"enabled": true}
	}
	return map[string]any{
		"type":        "anytls",
		"tag":         tag,
		"server":      server,
		"server_port": port,
		"password":    password,
		"tls":         tls,
	}, nil
}

func buildMieruClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	username, _ := raw["username"].(string)
	password, _ := raw["password"].(string)
	if strings.TrimSpace(username) == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("mieru_client needs username + password")
	}
	// hiddify-sing-box mieru client schema requires explicit network ([tcp]|[udp])
	// — without it the validator rejects with "Transport of Server Port is not
	// defined!". Default to TCP unless operator passes `network` explicitly.
	network := []string{"tcp"}
	if v, ok := raw["network"].([]any); ok && len(v) > 0 {
		network = nil
		for _, n := range v {
			if s, ok := n.(string); ok && strings.TrimSpace(s) != "" {
				network = append(network, strings.ToLower(s))
			}
		}
	} else if v, _ := raw["transport"].(string); strings.TrimSpace(v) != "" {
		switch strings.ToUpper(strings.TrimSpace(v)) {
		case "UDP":
			network = []string{"udp"}
		case "TCP+UDP", "BOTH":
			network = []string{"tcp", "udp"}
		}
	}
	// hiddify-sing-box mieru client uses portBindings (server-side validator,
	// reused on the client) so emit them per network entry. listen_port is
	// not relevant here (outbound side); we keep server_port for transparency
	// even though mieru actually reads portBindings.
	clientBindings := make([]map[string]any, 0, len(network))
	for _, n := range network {
		switch n {
		case "tcp":
			clientBindings = append(clientBindings, map[string]any{"port": port, "protocol": "TCP"})
		case "udp":
			clientBindings = append(clientBindings, map[string]any{"port": port, "protocol": "UDP"})
		}
	}
	out := map[string]any{
		"type":         "mieru",
		"tag":          tag,
		"server":       server,
		"server_port":  port,
		"username":     username,
		"password":     password,
		"portBindings": clientBindings,
	}
	if v, _ := raw["multiplexing"].(string); strings.TrimSpace(v) != "" {
		out["multiplexing"] = v
	}
	if v, ok := raw["mtu"].(float64); ok && v > 0 {
		out["mtu"] = int(v)
	}
	return out, nil
}

func buildTUICClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	uuid, _ := raw["uuid"].(string)
	password, _ := raw["password"].(string)
	if strings.TrimSpace(uuid) == "" || strings.TrimSpace(password) == "" {
		return nil, errors.New("tuic_client needs uuid + password")
	}
	tls, err := outboundTLSBlock(raw)
	if err != nil {
		return nil, err
	}
	if tls == nil {
		tls = map[string]any{"enabled": true, "alpn": []any{"h3"}}
	} else if _, has := tls["alpn"]; !has {
		tls["alpn"] = []any{"h3"}
	}
	cc, _ := raw["congestion_control"].(string)
	if strings.TrimSpace(cc) == "" {
		cc = "bbr"
	}
	out := map[string]any{
		"type":               "tuic",
		"tag":                tag,
		"server":             server,
		"server_port":        port,
		"uuid":               uuid,
		"password":           password,
		"congestion_control": cc,
		"tls":                tls,
	}
	if v, ok := raw["zero_rtt_handshake"].(bool); ok && v {
		out["zero_rtt_handshake"] = true
	}
	if v, _ := raw["udp_relay_mode"].(string); strings.TrimSpace(v) != "" {
		out["udp_relay_mode"] = v
	}
	return out, nil
}

func buildHy2ClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	password, _ := raw["password"].(string)
	if strings.TrimSpace(password) == "" {
		return nil, errors.New("hy2_client needs password")
	}
	tls, err := outboundTLSBlock(raw)
	if err != nil {
		return nil, err
	}
	if tls == nil {
		tls = map[string]any{"enabled": true}
	}
	out := map[string]any{
		"type":        "hysteria2",
		"tag":         tag,
		"server":      server,
		"server_port": port,
		"password":    password,
		"tls":         tls,
	}
	if obfs, _ := raw["obfs"].(map[string]any); len(obfs) > 0 {
		out["obfs"] = obfs
	}
	if up, ok := raw["up_mbps"].(float64); ok && up > 0 {
		out["up_mbps"] = int(up)
	}
	if down, ok := raw["down_mbps"].(float64); ok && down > 0 {
		out["down_mbps"] = int(down)
	}
	return out, nil
}

// buildWireGuardClientOutbound emits a hiddify-sing-box `endpoints[]` entry
// of type=wireguard with optional Amnezia obfuscation parameters. Used as a
// cascade member to tunnel through a self-hosted AmneziaWG server in DPI-
// heavy regions (the AWG junk-packet / magic-header obfuscation defeats
// signature-based WG blocks). Not compatible with Cloudflare WARP — CF
// servers only speak vanilla WireGuard and reject the AWG handshake.
//
// Required fields: server, server_port, private_key, peer_public_key.
// Optional: address (assigned IPv4 inside the tunnel, default 10.0.0.2/32),
// mtu, reserved (3-byte b64 for WARP-style reserved bits), preshared_key.
// AWG params live under `amnezia` (jc/jmin/jmax/s1-s4/h1-h4/i1-i5/j1-j3/itime).
func buildWireGuardClientOutbound(tag string, raw map[string]any) (map[string]any, error) {
	server, port, err := requireServer(raw)
	if err != nil {
		return nil, err
	}
	priv, _ := raw["private_key"].(string)
	peerPub, _ := raw["peer_public_key"].(string)
	if strings.TrimSpace(priv) == "" || strings.TrimSpace(peerPub) == "" {
		return nil, errors.New("wireguard_client needs private_key + peer_public_key")
	}
	addr := []any{"10.0.0.2/32"}
	if v, ok := raw["address"].([]any); ok && len(v) > 0 {
		addr = v
	} else if s, ok := raw["address"].(string); ok && strings.TrimSpace(s) != "" {
		addr = []any{s}
	}
	// sing-box wireguard endpoint `address` requires CIDR prefixes. WARP / AmneziaWG
	// .conf files list bare IPs (Address = 172.16.0.2, 2606:...), so append /32
	// (IPv4) or /128 (IPv6) when the prefix is missing.
	addr = normalizeWireGuardAddresses(addr)
	peer := map[string]any{
		"address":    server,
		"port":       port,
		"public_key": peerPub,
	}
	if v, _ := raw["preshared_key"].(string); strings.TrimSpace(v) != "" {
		peer["pre_shared_key"] = v
	}
	if v, _ := raw["reserved"].(string); strings.TrimSpace(v) != "" {
		peer["reserved"] = v
	}
	if v, ok := raw["allowed_ips"].([]any); ok && len(v) > 0 {
		peer["allowed_ips"] = v
	} else {
		peer["allowed_ips"] = []any{"0.0.0.0/0", "::/0"}
	}
	out := map[string]any{
		"type":        "wireguard",
		"tag":         tag,
		"address":     addr,
		"private_key": priv,
		"peers":       []any{peer},
	}
	if v, ok := raw["mtu"].(float64); ok && v > 0 {
		out["mtu"] = int(v)
	}
	if v, _ := raw["udp_timeout"].(string); strings.TrimSpace(v) != "" {
		out["udp_timeout"] = v
	}
	// AmneziaWG obfuscation (jc/jmin/jmax/s1-s4/h1-h4/i1-i5/j1-j3/itime): the
	// current hiddify-sing-box `extended` build does NOT ship the `amnezia`
	// endpoint option (the struct field is absent — sing-box rejects the config
	// with "unknown field amnezia"). Emitting it would break the whole singleton
	// config, so we DROP it and log once. Plain WireGuard / WARP still works; the
	// AWG anti-DPI obfuscation just isn't applied. Re-enable when the embedded
	// sing-box gains amnezia support (see .agent/plans — needs a fork/tag with it).
	if v, ok := raw["amnezia"].(map[string]any); ok && len(v) > 0 {
		logger.Warningf("singbox wireguard %q: dropping amnezia block — this sing-box build has no AmneziaWG support (plain WireGuard applied)", tag)
	}
	return out, nil
}

// normalizeWireGuardAddresses ensures every tunnel address carries a CIDR prefix
// (/32 for IPv4, /128 for IPv6). sing-box's wireguard endpoint rejects bare IPs.
func normalizeWireGuardAddresses(in []any) []any {
	out := make([]any, 0, len(in))
	for _, a := range in {
		s, ok := a.(string)
		if !ok {
			out = append(out, a)
			continue
		}
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if !strings.Contains(s, "/") {
			if strings.Contains(s, ":") {
				s += "/128" // IPv6
			} else {
				s += "/32" // IPv4
			}
		}
		out = append(out, s)
	}
	return out
}

// collectOutboundFragmentsForNode walks every enabled OutboundSidecar assigned
// to the node (or all standalone sidecars when nodeID == 0) and returns the
// per-section slices the aggregator splices into the final config blob.
//
// The function never errors — a malformed sidecar is logged + skipped so one
// bad row cannot break the entire sing-box config push.
func collectOutboundFragmentsForNode(nodeID int) (outbounds []json.RawMessage, bridges []json.RawMessage, rules []json.RawMessage, endpoints []json.RawMessage) {
	svc := OutboundSidecarService{}
	rows, err := svc.List(0)
	if err != nil {
		logger.Warningf("singbox outbound: list sidecars: %v", err)
		return nil, nil, nil, nil
	}
	for _, sc := range rows {
		if sc == nil || !sc.Enable {
			continue
		}
		// nodeID > 0  → worker context: only sidecars assigned to this worker.
		// nodeID == -1 → panel-host "hub" context (multi-node mode): sidecars
		//                with no NodeIds OR with explicit panel-host marker 0.
		// nodeID == 0 → standalone: include every sidecar.
		if nodeID > 0 && !sidecarAssignedToNode(sc, nodeID) {
			continue
		}
		if nodeID == -1 {
			panelHostOnly := len(sc.NodeIds) == 0
			for _, nid := range sc.NodeIds {
				if nid == 0 {
					panelHostOnly = true
					break
				}
			}
			if !panelHostOnly {
				continue
			}
		}
		frag, err := BuildSingboxOutboundForSidecar(sc)
		if err != nil {
			logger.Warningf("singbox outbound: skip sidecar id=%d (%s): %v", sc.Id, sc.Name, err)
			continue
		}
		if len(frag.Outbound) == 0 {
			continue
		}
		if frag.IsEndpoint {
			endpoints = append(endpoints, frag.Outbound)
		} else {
			outbounds = append(outbounds, frag.Outbound)
		}
		bridges = append(bridges, frag.BridgeInbound)
		rules = append(rules, frag.RouteRule)
	}
	return outbounds, bridges, rules, endpoints
}

func sidecarAssignedToNode(sc *model.OutboundSidecar, nodeID int) bool {
	for _, nid := range sc.NodeIds {
		if nid == nodeID {
			return true
		}
	}
	return false
}
