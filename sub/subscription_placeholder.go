package sub

import (
	"encoding/json"
	"errors"
	"net/url"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/web/service"
	"github.com/konstpic/sharx-code/v2/xray"
)

const placeholderVlessUUID = "00000000-0000-0000-0000-000000000000"

func trafficFromClientEntity(c *model.ClientEntity) xray.ClientTraffic {
	if c == nil {
		return xray.ClientTraffic{}
	}
	trafficLimit := int64(c.TotalGB * 1024 * 1024 * 1024)
	return xray.ClientTraffic{
		Email:      c.Email,
		Up:         c.Up,
		Down:       c.Down,
		Total:      trafficLimit,
		ExpiryTime: c.ExpiryTime,
		LastOnline: c.LastOnline,
	}
}

// subscriptionPlaceholderLines encodes each non-empty line as a dummy vless URI;
// clients typically show the URI fragment as the node title.
func subscriptionPlaceholderLines(remarks []string) []string {
	out := make([]string, 0, len(remarks))
	for _, r := range remarks {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		u := &url.URL{
			Scheme:   "vless",
			Host:     "0.0.0.0:1",
			RawQuery: "encryption=none&security=none&type=tcp&headerType=none",
		}
		u.User = url.User(placeholderVlessUUID)
		u.Fragment = r
		out = append(out, u.String())
	}
	return out
}

func isHWIDLimitStyleError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, service.ErrHWIDAdminBlocked) {
		return true
	}
	return strings.Contains(err.Error(), "HWID limit exceeded")
}

// jsonSubscriptionNoticeBody returns a minimal JSON document with blackhole
// outbounds tagged by remark lines (for /json/ subscription when links are blocked).
func jsonSubscriptionNoticeBody(remarks []string) string {
	var outbounds []map[string]any
	for _, r := range remarks {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		outbounds = append(outbounds, map[string]any{
			"tag":      r,
			"protocol": "blackhole",
			"settings": map[string]any{},
		})
	}
	if len(outbounds) == 0 {
		return "{}"
	}
	root := map[string]any{
		"remarks":   "Subscription",
		"log":       map[string]any{"loglevel": "warning"},
		"outbounds": outbounds,
	}
	b, _ := json.MarshalIndent(root, "", "  ")
	return string(b)
}
