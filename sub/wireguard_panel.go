package sub

import (
	"encoding/base64"
	"fmt"
	"net"
	"strings"

	"github.com/goccy/go-json"
	"golang.org/x/crypto/curve25519"

	"github.com/konstpic/sharx-code/v2/database/model"
)

// wireguardPublicKeyFromPrivateB64 decodes a standard WireGuard base64 private key and returns base64-encoded public key.
func wireguardPublicKeyFromPrivateB64(b64 string) (string, error) {
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return "", fmt.Errorf("empty key")
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		raw, err = base64.RawStdEncoding.DecodeString(b64)
		if err != nil {
			return "", err
		}
	}
	if len(raw) != 32 {
		return "", fmt.Errorf("key length %d, want 32", len(raw))
	}
	var sk [32]byte
	copy(sk[:], raw)
	sk[0] &= 248
	sk[31] = (sk[31] & 127) | 64
	var pk [32]byte
	curve25519.ScalarBaseMult(&pk, &sk)
	return base64.StdEncoding.EncodeToString(pk[:]), nil
}

func findWireguardPeerForClient(peers []any, clientEmail string) map[string]any {
	el := strings.ToLower(strings.TrimSpace(clientEmail))
	if el == "" {
		return nil
	}
	for _, p := range peers {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		for _, key := range []string{"email", "clientEmail", "panelEmail"} {
			if s, _ := m[key].(string); strings.ToLower(strings.TrimSpace(s)) == el {
				return m
			}
		}
	}
	return nil
}

// buildWireguardPanelInfo returns text for the panel "View connection keys" modal (not a v2ray:// URL).
// Optional clientEmail matches a server peer with "email" / "clientEmail" / "panelEmail" in settings JSON.
func (s *SubService) buildWireguardPanelInfo(inbound *model.Inbound, clientEmail string) string {
	if inbound == nil || model.NormalizeProtocol(inbound.Protocol) != model.WireGuard {
		return ""
	}
	var settings map[string]any
	_ = json.Unmarshal([]byte(inbound.Settings), &settings)
	if settings == nil {
		settings = map[string]any{}
	}

	var b strings.Builder
	b.WriteString("WireGuard (UDP) — this is not a v2ray:// link; use the data below in a WireGuard app.\n\n")

	addrs := s.getAddressesForInbound(inbound)
	var firstEndpoint string
	if len(addrs) == 0 {
		b.WriteString("Endpoint: (set panel Host / node address, or subscription web domain, so a host:port appears here.)\n\n")
	} else {
		for i, ap := range addrs {
			if i > 0 {
				b.WriteString("\n")
			}
			port := ap.Port
			if port <= 0 {
				port = inbound.Port
			}
			h := strings.TrimSpace(ap.Address)
			if h == "" {
				continue
			}
			ep := net.JoinHostPort(h, fmt.Sprintf("%d", port))
			if firstEndpoint == "" {
				firstEndpoint = ep
			}
			b.WriteString(fmt.Sprintf("Endpoint: %s\n", ep))
		}
		b.WriteString("\n")
	}

	if v, ok := settings["mtu"]; ok {
		b.WriteString(fmt.Sprintf("MTU: %v\n", v))
	}
	if v, ok := settings["noKernelTun"]; ok {
		b.WriteString(fmt.Sprintf("noKernelTun: %v\n", v))
	}
	if w, ok := settings["workers"]; ok {
		b.WriteString(fmt.Sprintf("workers: %v\n", w))
	}
	if arr, ok := settings["address"].([]any); ok && len(arr) > 0 {
		parts := make([]string, 0, len(arr))
		for _, x := range arr {
			parts = append(parts, fmt.Sprint(x))
		}
		b.WriteString("Server tunnel: ")
		b.WriteString(strings.Join(parts, ", "))
		b.WriteString("\n")
	}

	secret, _ := settings["secretKey"].(string)
	var serverPub string
	if secret != "" {
		if pub, err := wireguardPublicKeyFromPrivateB64(secret); err == nil {
			serverPub = pub
			b.WriteString("Server public key: " + serverPub + "\n")
		} else {
			b.WriteString("Server public key: (invalid secretKey; must be 32-byte standard base64.)\n")
		}
	} else {
		b.WriteString("Server public key: (missing — set secretKey in the inbound.)\n")
	}

	peers, _ := settings["peers"].([]any)
	clientEmail = strings.TrimSpace(clientEmail)
	b.WriteString("\n---\n")
	b.WriteString("Peers on the server (Xray `settings.peers`)\n")
	if len(peers) == 0 {
		b.WriteString("None yet — this is expected until you add clients by public key in the panel:\n")
		b.WriteString("  Inbounds → this inbound → WireGuard section → add a row in Peers (device public key, AllowedIPs).\n")
		b.WriteString("  The panel does not create WireGuard keys from “clients” automatically.\n")
		b.WriteString("  To show one peer block below for *this* user, add a field email (or clientEmail) on that peer, same as this client’s email in the panel.\n")
	} else {
		b.WriteString(fmt.Sprintf("Configured: %d peer(s).\n", len(peers)))
		if m := findWireguardPeerForClient(peers, clientEmail); m != nil {
			b.WriteString("\nRow linked to this client (matched by email on the peer)\n")
			if pk, _ := m["publicKey"].(string); strings.TrimSpace(pk) != "" {
				b.WriteString("Device public key (must be this key on the server peer row): " + strings.TrimSpace(pk) + "\n")
			}
			if aip, ok := m["allowedIPs"].([]any); ok && len(aip) > 0 {
				parts := make([]string, 0, len(aip))
				for _, x := range aip {
					parts = append(parts, fmt.Sprint(x))
				}
				b.WriteString("AllowedIPs: " + strings.Join(parts, ", ") + "\n")
			}
			if psk, _ := m["preSharedKey"].(string); strings.TrimSpace(psk) != "" {
				b.WriteString("Pre-shared key: " + strings.TrimSpace(psk) + "\n")
			}
		} else if clientEmail != "" {
			b.WriteString("\nNo peer row is tagged for this client. Add \"email\" (or clientEmail) on a peer, equal to: " + clientEmail + "\n")
		} else {
			b.WriteString("\n(Assign an email to this client in the panel to match a peer by email.)\n")
		}
	}

	if serverPub != "" {
		b.WriteString("\n---\n")
		b.WriteString("Example: paste into a WireGuard app (or .conf). Replace Interface Address with an IP you allowed for this device.\n\n")
		b.WriteString("[Interface]\n")
		b.WriteString("# PrivateKey = <your device: generate in the app, then put the public key on the server peer row>\n")
		b.WriteString("# Address = <e.g. 10.8.0.2/32 — from AllowedIPs for this device>\n\n")
		b.WriteString("[Peer]\n")
		b.WriteString("PublicKey = " + serverPub + "\n")
		if firstEndpoint != "" {
			b.WriteString("Endpoint = " + firstEndpoint + "\n")
		} else {
			b.WriteString("# Endpoint = host:port (set when Endpoint appears above)\n")
		}
		b.WriteString("AllowedIPs = 0.0.0.0/0, ::/0\n")
	}
	return strings.TrimSpace(b.String()) + "\n"
}
