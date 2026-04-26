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
}

// WireGuardPeerRequest is one Xray `peers` entry (no panel-managed inbounds; keys are public only).
type WireGuardPeerRequest struct {
	PublicKey    string   `json:"publicKey"`
	PreSharedKey string   `json:"preSharedKey"`
	AllowedIPs   []string `json:"allowedIPs"`
}

const (
	defaultWireGuardMTU  = 1420
	defaultWireGuardCIDR = "10.8.0.1/32"
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
}

type wireGuardPeerOut struct {
	PublicKey    string   `json:"publicKey"`
	PreSharedKey string   `json:"preSharedKey,omitempty"`
	AllowedIPs   []string `json:"allowedIPs,omitempty"`
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
		peers = append(peers, outP)
	}
	out := wireGuardSettingsOut{
		Mtu:         mtu,
		SecretKey:   sk,
		Address:     addrs,
		Peers:       peers,
		NoKernelTun: nokt,
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
