package service

import (
	"encoding/base64"
	"fmt"
	"math"
	"net"
	"sort"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"golang.org/x/crypto/curve25519"
)

func wireguardPeerPublicKeyFromPrivateB64(b64 string) (string, error) {
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return "", fmt.Errorf("empty private key")
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

func randomWireGuardPreSharedKeyB64() (string, error) {
	return RandomWireGuardSecretKeyBase64()
}

func wireGuardPeerAnyEmail(m map[string]any) string {
	for _, key := range []string{"email", "clientEmail", "panelEmail"} {
		if s, _ := m[key].(string); strings.TrimSpace(s) != "" {
			return strings.TrimSpace(s)
		}
	}
	return ""
}

func wireGuardSetPeerEmail(m map[string]any, email string) {
	m["email"] = email
	m["clientEmail"] = email
}

func isWireGuardClientActive(c *model.ClientEntity) bool {
	if c == nil {
		return false
	}
	if !c.Enable {
		return false
	}
	if c.Status == "expired_traffic" || c.Status == "expired_time" {
		return false
	}
	return true
}

func anyToInt(v any) int {
	switch n := v.(type) {
	case int:
		return n
	case int32:
		return int(n)
	case int64:
		return int(n)
	case float64:
		if n <= 0 || n > float64(math.MaxInt32) {
			return 0
		}
		return int(n)
	default:
		return 0
	}
}

// parseWireGuardIPv4FromCIDR s is like "10.8.0.1/32"
func parseWireGuardIPv4FromCIDR(s string) (net.IP, *net.IPNet, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil, fmt.Errorf("empty cidr")
	}
	if !strings.Contains(s, "/") {
		s += "/32"
	}
	return net.ParseCIDR(s)
}

// collectWireGuardUsedIPv4 collects host IPv4s from CIDRs for pool allocation.
func collectWireGuardUsedIPv4(addrs []any, peers []map[string]any) map[[4]byte]struct{} {
	used := make(map[[4]byte]struct{})
	for _, a := range addrs {
		s, _ := a.(string)
		if s == "" {
			continue
		}
		ip, n, err := net.ParseCIDR(strings.TrimSpace(maybeAddSlash32v4(s)))
		if err != nil || ip == nil || n == nil {
			continue
		}
		if ip4 := ip.To4(); ip4 != nil {
			var b [4]byte
			copy(b[:], ip4)
			used[b] = struct{}{}
		}
	}
	for _, p := range peers {
		ips, ok := p["allowedIPs"].([]any)
		if !ok {
			continue
		}
		for _, x := range ips {
			s, _ := x.(string)
			trim := strings.TrimSpace(s)
			if trim == "" {
				continue
			}
			ip, _, err := net.ParseCIDR(maybeAddSlash32v4(trim))
			if err != nil || ip == nil {
				continue
			}
			if ip4 := ip.To4(); ip4 != nil {
				var b [4]byte
				copy(b[:], ip4)
				used[b] = struct{}{}
			}
		}
	}
	return used
}

func maybeAddSlash32v4(s string) string {
	if !strings.Contains(s, "/") {
		return s + "/32"
	}
	return s
}

// nextFreeWireGuardClientIPv4 returns next  x.x.x.y/32 not in `used` within the /24 of the first server address.
func nextFreeWireGuardClientIPv4(serverAddrs []any, used map[[4]byte]struct{}) string {
	if used == nil {
		used = make(map[[4]byte]struct{})
	}
	var base net.IP
	for _, a := range serverAddrs {
		s, _ := a.(string)
		if s == "" {
			continue
		}
		ip, n, err := net.ParseCIDR(strings.TrimSpace(maybeAddSlash32v4(s)))
		if err != nil || n == nil {
			continue
		}
		if ip4 := ip.To4(); ip4 != nil {
			mask := net.CIDRMask(24, 32)
			base = ip4.Mask(mask)
			break
		}
	}
	if base == nil {
		base = net.IPv4(10, 8, 0, 0)
	}
	for o := 2; o <= 254; o++ {
		buf := net.IPv4(base[0], base[1], base[2], byte(o))
		var key [4]byte
		copy(key[:], buf.To4())
		if _, ok := used[key]; !ok {
			used[key] = struct{}{}
			return fmt.Sprintf("%s/32", buf.String())
		}
	}
	return "10.8.0.2/32"
}

func mergeWireGuardSettingsWithClients(settings map[string]any, clientEntities []*model.ClientEntity) error {
	if settings == nil {
		return nil
	}
	peersAny, _ := settings["peers"].([]any)
	manual := make([]map[string]any, 0, len(peersAny))
	byEmail := make(map[string]map[string]any)

	for _, p := range peersAny {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		if e := wireGuardPeerAnyEmail(m); e == "" {
			manual = append(manual, m)
		} else {
			byEmail[strings.ToLower(e)] = m
		}
	}

	active := make([]*model.ClientEntity, 0, len(clientEntities))
	assigned := make([]*model.ClientEntity, 0, len(clientEntities))
	for _, c := range clientEntities {
		if c == nil || strings.TrimSpace(c.Email) == "" {
			continue
		}
		assigned = append(assigned, c)
		if isWireGuardClientActive(c) {
			active = append(active, c)
		}
	}
	sort.Slice(active, func(i, j int) bool { return active[i].Email < active[j].Email })
	sort.Slice(assigned, func(i, j int) bool { return assigned[i].Email < assigned[j].Email })

	inactivePeersAny, _ := settings[PanelWireGuardInactivePeersSettingsKey].([]any)
	for _, p := range inactivePeersAny {
		m, ok := p.(map[string]any)
		if !ok {
			continue
		}
		e := wireGuardPeerAnyEmail(m)
		if e == "" {
			continue
		}
		ek := strings.ToLower(e)
		if _, exists := byEmail[ek]; !exists {
			byEmail[ek] = m
		}
	}

	assignedSet := make(map[string]struct{}, len(assigned))
	for _, c := range assigned {
		assignedSet[strings.ToLower(strings.TrimSpace(c.Email))] = struct{}{}
	}
	for k := range byEmail {
		if _, ok := assignedSet[k]; !ok {
			delete(byEmail, k)
		}
	}

	srv, _ := settings["address"].([]any)
	if len(srv) == 0 {
		s := strings.TrimSpace(defaultWireGuardCIDR)
		if s != "" {
			srv = []any{s}
		}
	}

	// Collect all peers' allowedIPs for IP pool, including manual (server path may share subnet).
	allPeersForUsed := make([]map[string]any, 0, len(manual)+len(byEmail))
	for _, m := range manual {
		allPeersForUsed = append(allPeersForUsed, m)
	}
	for _, m := range byEmail {
		allPeersForUsed = append(allPeersForUsed, m)
	}
	used := collectWireGuardUsedIPv4(srv, allPeersForUsed)

	// Ensure keys and IPs for every assigned client; inactive peers stay in the vault with stable keys.
	for _, c := range assigned {
		ek := strings.ToLower(strings.TrimSpace(c.Email))
		peer, ok := byEmail[ek]
		if !ok {
			peer = make(map[string]any)
			byEmail[ek] = peer
		}
		wireGuardSetPeerEmail(peer, c.Email)

		pk := strings.TrimSpace(strAny(peer["publicKey"]))
		priv := strings.TrimSpace(strAny(peer["privateKey"]))
		if pk == "" && priv != "" {
			if d, err := wireguardPeerPublicKeyFromPrivateB64(priv); err == nil {
				pk = d
				peer["publicKey"] = pk
			}
		}
		if pk == "" {
			newPriv, err := RandomWireGuardSecretKeyBase64()
			if err != nil {
				return err
			}
			pub, err := wireguardPeerPublicKeyFromPrivateB64(newPriv)
			if err != nil {
				return err
			}
			peer["privateKey"] = newPriv
			peer["publicKey"] = pub
		}
		if ps := strings.TrimSpace(strAny(peer["preSharedKey"])); ps == "" {
			p, err := randomWireGuardPreSharedKeyB64()
			if err != nil {
				return err
			}
			peer["preSharedKey"] = p
		}
		if anyToInt(peer["keepAlive"]) <= 0 {
			peer["keepAlive"] = defaultWireGuardPeerKeepAlive
		}
		allowed, ok := peer["allowedIPs"].([]any)
		needIP := true
		if ok && len(allowed) > 0 {
			for _, x := range allowed {
				if strings.TrimSpace(strAny(x)) != "" {
					needIP = false
					break
				}
			}
		}
		if needIP {
			cidr := nextFreeWireGuardClientIPv4(srv, used)
			peer["allowedIPs"] = []any{cidr}
		} else {
			for i, x := range allowed {
				s0 := strAny(x)
				if t := strings.TrimSpace(s0); t != "" && !strings.Contains(t, "/") {
					allowed[i] = t + "/32"
				}
			}
			peer["allowedIPs"] = allowed
		}
	}

	out := make([]any, 0, len(manual)+len(active))
	for _, m := range manual {
		out = append(out, m)
	}
	for _, c := range active {
		ek := strings.ToLower(strings.TrimSpace(c.Email))
		if p := byEmail[ek]; p != nil {
			out = append(out, p)
		}
	}
	settings["peers"] = out

	inactiveOut := make([]any, 0)
	for _, c := range assigned {
		if isWireGuardClientActive(c) {
			continue
		}
		ek := strings.ToLower(strings.TrimSpace(c.Email))
		if p := byEmail[ek]; p != nil {
			inactiveOut = append(inactiveOut, p)
		}
	}
	if len(inactiveOut) > 0 {
		settings[PanelWireGuardInactivePeersSettingsKey] = inactiveOut
	} else {
		delete(settings, PanelWireGuardInactivePeersSettingsKey)
	}
	return nil
}

func strAny(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}
