package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"
	"unicode"
)

const (
	happRoutingAddPrefix  = "happ://routing/add/"
	incyRoutingAddPrefix  = "incy://routing/add/"
	sharxRoutingAddPrefix = "sharx://routing/add/"
)

// routingDeepLinkPrefix mirrors panel/lib/happRouting.ts getRoutingDeepLinkPrefix for subscription headers.
func routingDeepLinkPrefixForProfile(p *SharxSubpageRoutingProfile) string {
	if p == nil {
		return happRoutingAddPrefix
	}
	preset := strings.ToLower(strings.TrimSpace(p.DeepLinkPreset))
	switch preset {
	case "incy":
		return incyRoutingAddPrefix
	case "sharx":
		return sharxRoutingAddPrefix
	case "custom":
		t := strings.TrimSpace(p.DeepLinkCustomPrefix)
		if t == "" {
			return happRoutingAddPrefix
		}
		if strings.HasSuffix(t, "/") {
			return t
		}
		return t + "/"
	default:
		return happRoutingAddPrefix
	}
}

// compactBase64InlineRoutingProfile returns Base64(UTF-8, compact JSON) for a profile with inline JSON body.
func compactBase64InlineRoutingProfile(p *SharxSubpageRoutingProfile) (string, bool) {
	if p == nil {
		return "", false
	}
	if strings.EqualFold(strings.TrimSpace(p.Source), "url") {
		return "", false
	}
	body := strings.TrimSpace(p.Body)
	if body == "" {
		return "", false
	}
	if !json.Valid([]byte(body)) {
		return "", false
	}
	var buf bytes.Buffer
	if err := json.Compact(&buf, []byte(body)); err != nil {
		return "", false
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), true
}

// RoutingHeaderValueForSubscription returns the first usable inline profile as a Happ-style deeplink:
// `{prefix}{base64}` where prefix is typically happ://routing/add/ (see Happ routing docs). Matches the
// panel constructor's "generated deep link" and subscription header examples using the routing: key.
// URL-sourced profiles are skipped (no fetch on subscription).
func RoutingHeaderValueForSubscription(cfg *SharxSubpageConfigV2) (string, bool) {
	if cfg == nil || cfg.Routing == nil {
		return "", false
	}
	for i := range cfg.Routing.Profiles {
		p := &cfg.Routing.Profiles[i]
		b64, ok := compactBase64InlineRoutingProfile(p)
		if !ok {
			continue
		}
		return routingDeepLinkPrefixForProfile(p) + b64, true
	}
	return "", false
}

// RoutingPayloadBase64ForSubscription returns Base64(UTF-8, compact JSON) only (no scheme). Prefer
// RoutingHeaderValueForSubscription for HTTP subscription headers — Happ expects happ://routing/add/{payload}.
// Kept for tests and any caller that only needs the raw segment.
func RoutingPayloadBase64ForSubscription(cfg *SharxSubpageConfigV2) (string, bool) {
	if cfg == nil || cfg.Routing == nil {
		return "", false
	}
	for i := range cfg.Routing.Profiles {
		p := &cfg.Routing.Profiles[i]
		if b64, ok := compactBase64InlineRoutingProfile(p); ok {
			return b64, true
		}
	}
	return "", false
}

const (
	// common mistake: subscription-style happ://add/… instead of happ://routing/add/…
	happAddSubscriptionPrefix = "happ://add/"
)

// isStandardBase64Char reports whether r is a character allowed in std base64 (before padding).
func isStandardBase64Char(r rune) bool {
	if r == '+' || r == '/' {
		return true
	}
	if r >= 'A' && r <= 'Z' {
		return true
	}
	if r >= 'a' && r <= 'z' {
		return true
	}
	if r >= '0' && r <= '9' {
		return true
	}
	return false
}

// looksLikeStandardBase64Payload returns true if s is non-empty, has no URL scheme,
// and uses only base64 alphabet + optional padding (whitespace is ignored).
func looksLikeStandardBase64Payload(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || strings.Contains(s, "://") {
		return false
	}
	seen := false
	for _, r := range s {
		if unicode.IsSpace(r) {
			continue
		}
		seen = true
		if r == '=' {
			continue
		}
		if !isStandardBase64Char(r) {
			return false
		}
	}
	return seen
}

// decodeStdBase64JSON tries to decode s as standard Base64; returns the bytes if the result is JSON.
func decodeStdBase64JSON(s string) ([]byte, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, false
	}
	raw, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, false
	}
	if len(raw) == 0 || !json.Valid(raw) {
		return nil, false
	}
	return raw, true
}

// NormalizeSubscriptionRoutingHeaderValue coerces the HTTP "Routing" header to Happ-style
// `scheme://routing/add/{base64(UTF-8 JSON)}` when the value is clearly raw Base64, or the
// mistaken `happ://add/{base64}` (subscription add link) with a routing JSON payload.
// Values that already contain `://routing/add/` (any scheme) are left unchanged, as are
// non-JSON / opaque strings.
func NormalizeSubscriptionRoutingHeaderValue(v string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return v
	}
	lower := strings.ToLower(v)
	if strings.Contains(lower, "://routing/add/") {
		return v
	}

	// happ://add/<b64> → happ://routing/add/<b64>
	if strings.HasPrefix(lower, happAddSubscriptionPrefix) {
		rest := strings.TrimSpace(v[len(happAddSubscriptionPrefix):])
		if rest == "" {
			return v
		}
		if raw, ok := decodeStdBase64JSON(rest); ok && len(raw) > 0 {
			return happRoutingAddPrefix + rest
		}
	}

	if !looksLikeStandardBase64Payload(v) {
		return v
	}
	if _, ok := decodeStdBase64JSON(v); !ok {
		return v
	}
	return happRoutingAddPrefix + strings.TrimSpace(v)
}
