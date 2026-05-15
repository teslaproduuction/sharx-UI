package service

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net"
	"strings"
)

// WireGuardInboundRequest is the panel form payload; inbound `settings` JSON is built from it on the server.
type WireGuardInboundRequest struct {
	Mtu         int                    `json:"mtu"`
	SecretKey   string                 `json:"secretKey"`
	Address     []string               `json:"address"`
	Peers       []WireGuardPeerRequest `json:"peers"`
	NoKernelTun *bool                  `json:"noKernelTun"`
	Workers     *int                   `json:"workers"`
	// ClientDNS is written to settings as `clientDns` (not used by Xray) and shown in user WireGuard [Interface] as `DNS = …`.
	ClientDNS []string `json:"clientDns"`
}

// WireGuardPeerRequest is one Xray `peers` entry (no panel-managed inbounds; keys are public only).
type WireGuardPeerRequest struct {
	PublicKey    string   `json:"publicKey"`
	PreSharedKey string   `json:"preSharedKey"`
	AllowedIPs   []string `json:"allowedIPs"`
	// KeepAlive is PersistentKeepalive seconds (Xray `keepAlive`); 0 or omitted → defaultWireGuardPeerKeepAlive.
	KeepAlive int `json:"keepAlive"`
}

const (
	defaultWireGuardMTU           = 1420
	defaultWireGuardCIDR          = "10.8.0.1/32"
	defaultWireGuardPeerKeepAlive = 25
	// PanelWireGuardInactivePeersSettingsKey stores WG peer rows for clients assigned to this inbound
	// who are disabled or expired. Xray must not see this key; see SanitizeWireGuardSettingsJSONForXray.
	PanelWireGuardInactivePeersSettingsKey = "panelWgInactivePeers"
)

// normalizeWireGuardInterfaceAddress forces Xray-required masks: /32 (IPv4) and /128 (IPv6).
// Earlier panels used e.g. 10.8.0.1/24, which Xray 26+ rejects for inbound `address`.
func normalizeWireGuardInterfaceAddress(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	host := s
	if i := strings.IndexByte(s, '/'); i >= 0 {
		host = strings.TrimSpace(s[:i])
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return s
	}
	if ip4 := ip.To4(); ip4 != nil {
		return ip4.String() + "/32"
	}
	return ip.String() + "/128"
}

// normalizeWireGuardClientDNSList trims and drops empty entries (order preserved).
func normalizeWireGuardClientDNSList(in []string) []string {
	if len(in) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(in))
	for _, s := range in {
		t := strings.TrimSpace(s)
		if t == "" {
			continue
		}
		out = append(out, t)
	}
	return out
}

// SanitizeWireGuardSettingsJSONForXray returns settings safe to embed in an Xray core inbound:
// drops panel-only inactive-peer vault and per-peer privateKey, normalizes `address` masks.
func SanitizeWireGuardSettingsJSONForXray(settings string) string {
	settings = strings.TrimSpace(settings)
	if settings == "" {
		return settings
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(settings), &m); err != nil || m == nil {
		return settings
	}
	delete(m, PanelWireGuardInactivePeersSettingsKey)
	if peers, ok := m["peers"].([]any); ok {
		for _, p := range peers {
			pm, ok := p.(map[string]any)
			if !ok {
				continue
			}
			delete(pm, "privateKey")
		}
	}
	b, err := json.Marshal(m)
	if err != nil {
		return settings
	}
	return applyWireGuardSettingsAddressForXray(string(b))
}

// applyWireGuardSettingsAddressForXray rewrites `address` to /32 and /128 so Xray 26+ accepts configs
// still stored in the DB with older panel defaults (e.g. 10.8.0.1/24).
func applyWireGuardSettingsAddressForXray(settings string) string {
	if strings.TrimSpace(settings) == "" {
		return settings
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(settings), &m); err != nil {
		return settings
	}
	raw, ok := m["address"]
	if !ok {
		return settings
	}
	norm := normalizeWireGuardInterfaceAddress
	switch v := raw.(type) {
	case []any:
		out := make([]any, 0, len(v))
		for _, x := range v {
			s, _ := x.(string)
			if strings.TrimSpace(s) != "" {
				out = append(out, norm(s))
			}
		}
		if len(out) == 0 {
			return settings
		}
		m["address"] = out
	case string:
		if strings.TrimSpace(v) == "" {
			return settings
		}
		m["address"] = norm(v)
	default:
		return settings
	}
	b, err := json.Marshal(m)
	if err != nil {
		return settings
	}
	return string(b)
}

// RandomWireGuardSecretKeyBase64 returns a 32-byte random key as standard base64 (Xray `secretKey`).
func RandomWireGuardSecretKeyBase64() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(b), nil
}

type wireGuardSettingsOut struct {
	Mtu         int                `json:"mtu"`
	SecretKey   string             `json:"secretKey"`
	Address     []string           `json:"address"`
	Peers       []wireGuardPeerOut `json:"peers"`
	NoKernelTun bool               `json:"noKernelTun"`
	Workers     *int               `json:"workers,omitempty"`
	// Always emitted (may be empty) so panel round-trips explicit client DNS list.
	ClientDNS []string `json:"clientDns"`
}

type wireGuardPeerOut struct {
	PublicKey    string   `json:"publicKey"`
	PreSharedKey string   `json:"preSharedKey,omitempty"`
	AllowedIPs   []string `json:"allowedIPs,omitempty"`
	KeepAlive    int      `json:"keepAlive,omitempty"`
}

// BuildWireGuardInboundSettingsJSON builds Xray inbound `settings` JSON for protocol wireguard.
// Empty or nil request uses defaults; empty `secretKey` generates a new key.
func BuildWireGuardInboundSettingsJSON(r *WireGuardInboundRequest) (string, error) {
	if r == nil {
		r = &WireGuardInboundRequest{}
	}
	mtu := r.Mtu
	if mtu <= 0 {
		mtu = defaultWireGuardMTU
	}
	sk := strings.TrimSpace(r.SecretKey)
	if sk == "" {
		var err error
		sk, err = RandomWireGuardSecretKeyBase64()
		if err != nil {
			return "", err
		}
	}
	addrs := make([]string, 0, len(r.Address))
	for _, a := range r.Address {
		t := strings.TrimSpace(a)
		if t == "" {
			continue
		}
		if n := normalizeWireGuardInterfaceAddress(t); n != "" {
			addrs = append(addrs, n)
		}
	}
	if len(addrs) == 0 {
		addrs = []string{defaultWireGuardCIDR}
	}
	nokt := true
	if r.NoKernelTun != nil {
		nokt = *r.NoKernelTun
	}
	peers := make([]wireGuardPeerOut, 0, len(r.Peers))
	for _, p := range r.Peers {
		pk := strings.TrimSpace(p.PublicKey)
		if pk == "" {
			continue
		}
		outP := wireGuardPeerOut{PublicKey: pk}
		if ps := strings.TrimSpace(p.PreSharedKey); ps != "" {
			outP.PreSharedKey = ps
		}
		if len(p.AllowedIPs) > 0 {
			ips := make([]string, 0, len(p.AllowedIPs))
			for _, ip := range p.AllowedIPs {
				if t := strings.TrimSpace(ip); t != "" {
					ips = append(ips, t)
				}
			}
			if len(ips) > 0 {
				outP.AllowedIPs = ips
			}
		}
		ka := p.KeepAlive
		if ka <= 0 {
			ka = defaultWireGuardPeerKeepAlive
		}
		outP.KeepAlive = ka
		peers = append(peers, outP)
	}
	dns := normalizeWireGuardClientDNSList(r.ClientDNS)
	out := wireGuardSettingsOut{
		Mtu:         mtu,
		SecretKey:   sk,
		Address:     addrs,
		Peers:       peers,
		NoKernelTun: nokt,
		ClientDNS:   dns,
	}
	if r.Workers != nil && *r.Workers > 0 {
		w := *r.Workers
		out.Workers = &w
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// PreserveWireGuardPeersOnInboundUpdate copies `peers` from the previous inbound `settings` when
// the new payload has no peer rows. The panel only edits the server block (mtu, secretKey, address, …);
// peers are maintained by client ↔ inbound assignment, so saves must not replace them with [].
func PreserveWireGuardPeersOnInboundUpdate(newSettingsJSON, oldSettingsJSON string) (string, error) {
	newSettingsJSON = strings.TrimSpace(newSettingsJSON)
	oldSettingsJSON = strings.TrimSpace(oldSettingsJSON)
	if oldSettingsJSON == "" {
		return newSettingsJSON, nil
	}
	var newM map[string]any
	if err := json.Unmarshal([]byte(newSettingsJSON), &newM); err != nil || newM == nil {
		newM = make(map[string]any)
	}
	pNew, _ := newM["peers"].([]any)
	peersRestored := false
	if len(pNew) == 0 {
		var oldM map[string]any
		if err := json.Unmarshal([]byte(oldSettingsJSON), &oldM); err != nil || oldM == nil {
			return newSettingsJSON, nil
		}
		pOld, _ := oldM["peers"].([]any)
		if len(pOld) == 0 {
			return newSettingsJSON, nil
		}
		newM["peers"] = pOld
		peersRestored = true
		if !wireGuardInactivePeersPresent(newM) && wireGuardInactivePeersPresent(oldM) {
			if v, ok := oldM[PanelWireGuardInactivePeersSettingsKey]; ok {
				newM[PanelWireGuardInactivePeersSettingsKey] = v
			}
		}
	}
	if len(pNew) > 0 && !peersRestored {
		return newSettingsJSON, nil
	}
	b, err := json.MarshalIndent(newM, "", "  ")
	if err != nil {
		return newSettingsJSON, err
	}
	return string(b), nil
}

func wireGuardInactivePeersPresent(m map[string]any) bool {
	if m == nil {
		return false
	}
	p, ok := m[PanelWireGuardInactivePeersSettingsKey].([]any)
	return ok && len(p) > 0
}
