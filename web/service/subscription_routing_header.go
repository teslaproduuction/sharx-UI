package service

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"
)

// RoutingPayloadBase64ForSubscription returns Base64(UTF-8, compact JSON) for the first
// usable inline client routing profile. Used for Happ / V2RayTun "Routing" subscription header.
// URL-sourced profiles are skipped (no fetch on subscription).
func RoutingPayloadBase64ForSubscription(cfg *SharxSubpageConfigV2) (string, bool) {
	if cfg == nil || cfg.Routing == nil {
		return "", false
	}
	for _, p := range cfg.Routing.Profiles {
		if strings.EqualFold(strings.TrimSpace(p.Source), "url") {
			continue
		}
		body := strings.TrimSpace(p.Body)
		if body == "" {
			continue
		}
		if !json.Valid([]byte(body)) {
			continue
		}
		var buf bytes.Buffer
		if err := json.Compact(&buf, []byte(body)); err != nil {
			continue
		}
		return base64.StdEncoding.EncodeToString(buf.Bytes()), true
	}
	return "", false
}
