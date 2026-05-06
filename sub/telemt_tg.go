package sub

import (
	"encoding/hex"
	"encoding/json"
	"strings"
)

// telemtTlsDomainForSubLink returns censorship fake-TLS domain for tg:// secret suffix (Telemt build_user_links).
// Empty / missing JSON falls back to the same default as web/service BuildTelemtToml.
func telemtTlsDomainForSubLink(settingsJSON string) string {
	var root map[string]any
	if err := json.Unmarshal([]byte(strings.TrimSpace(settingsJSON)), &root); err != nil {
		return "petrovich.ru"
	}
	t, ok := root["telemt"].(map[string]any)
	if !ok {
		return "petrovich.ru"
	}
	c, ok := t["censorship"].(map[string]any)
	if !ok {
		return "petrovich.ru"
	}
	td := ""
	if v, ok := c["tlsDomain"].(string); ok {
		td = strings.TrimSpace(v)
	}
	if td == "" {
		if v, ok := c["sni"].(string); ok {
			td = strings.TrimSpace(v)
		}
	}
	if td == "" {
		return "petrovich.ru"
	}
	return td
}

// telemtTgProxySecretForLink builds the `secret` query value for tg://proxy (lowercase hex).
// Fake-TLS: "ee" + 32-hex user secret + hex(UTF-8 tls_domain) — same string layout as telemt api users build_user_links.
// Secure: "dd" + 32-hex; classic: 32-hex only.
func telemtTgProxySecretForLink(raw16 []byte, tlsMode, secure bool, tlsDomain string) string {
	keyHex := strings.ToLower(hex.EncodeToString(raw16))
	switch {
	case tlsMode:
		d := strings.TrimSpace(tlsDomain)
		if d != "" {
			return "ee" + keyHex + strings.ToLower(hex.EncodeToString([]byte(d)))
		}
		return "ee" + keyHex
	case secure:
		return "dd" + keyHex
	default:
		return keyHex
	}
}
