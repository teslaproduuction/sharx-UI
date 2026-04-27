package xray

import (
	"encoding/json"

	"github.com/konstpic/sharx-code/v2/util/json_util"
)

// EnsureAPIRoutingOutbound appends a minimal freedom outbound tagged "api" when routing references it
// (inboundTag api -> outboundTag api) but no outbound with tag "api" exists — avoids
// "non existing outTag: api" from the dispatcher.
func EnsureAPIRoutingOutbound(cfg *Config) {
	if cfg == nil || len(cfg.OutboundConfigs) == 0 {
		return
	}
	var outbounds []map[string]interface{}
	if err := json.Unmarshal(cfg.OutboundConfigs, &outbounds); err != nil {
		return
	}
	for _, o := range outbounds {
		if tag, ok := o["tag"].(string); ok && tag == "api" {
			return
		}
	}
	apiOb := map[string]interface{}{
		"tag":      "api",
		"protocol": "freedom",
		"settings": map[string]interface{}{
			"domainStrategy": "AsIs",
			"redirect":       "",
			"noises":         []interface{}{},
		},
	}
	outbounds = append(outbounds, apiOb)
	b, err := json.Marshal(outbounds)
	if err != nil {
		return
	}
	cfg.OutboundConfigs = json_util.RawMessage(b)
}
