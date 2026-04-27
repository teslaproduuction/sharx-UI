package xray

import (
	"encoding/json"

	"github.com/konstpic/sharx-code/v2/util/json_util"
)

// EnsurePolicyStatsUserOnline forces statsUserUplink, statsUserDownlink, and statsUserOnline
// on every policy level so Xray records per-user traffic and online (user>>>email>>>...).
func EnsurePolicyStatsUserOnline(cfg *Config) {
	if cfg == nil {
		return
	}
	if len(cfg.Policy) == 0 {
		cfg.Policy = json_util.RawMessage([]byte(`{
  "levels": {
    "0": {
      "statsUserUplink": true,
      "statsUserDownlink": true,
      "statsUserOnline": true
    }
  },
  "system": {
    "statsInboundDownlink": true,
    "statsInboundUplink": true,
    "statsOutboundDownlink": false,
    "statsOutboundUplink": false
  }
}`))
		return
	}
	var pol map[string]interface{}
	if err := json.Unmarshal(cfg.Policy, &pol); err != nil {
		return
	}
	levels, ok := pol["levels"].(map[string]interface{})
	if !ok || levels == nil {
		levels = make(map[string]interface{})
		pol["levels"] = levels
	}
	l0, ok := levels["0"].(map[string]interface{})
	if !ok || l0 == nil {
		l0 = make(map[string]interface{})
		levels["0"] = l0
	}
	// Per-user counters (user>>>email>>>traffic>>>uplink|downlink) and online maps require these
	// flags on the client's policy level. Templates may set them to false — override so the panel
	// always receives Hy2/VLESS/etc. stats via StatsService (see Xray dispatcher getLink/WrapLink).
	for _, lv := range levels {
		lm, ok := lv.(map[string]interface{})
		if !ok || lm == nil {
			continue
		}
		lm["statsUserUplink"] = true
		lm["statsUserDownlink"] = true
		lm["statsUserOnline"] = true
	}
	merged, err := json.Marshal(pol)
	if err != nil {
		return
	}
	cfg.Policy = json_util.RawMessage(merged)
}
