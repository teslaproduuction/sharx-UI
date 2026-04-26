package xray

import (
	"encoding/json"

	"github.com/konstpic/sharx-code/v2/util/json_util"
)

// EnsurePolicyStatsUserOnline merges policy.levels[0] so Xray records per-user online IP
// maps (counter name user>>>email>>>online). Required for session list and connection drop.
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
	if _, ok := l0["statsUserUplink"]; !ok {
		l0["statsUserUplink"] = true
	}
	if _, ok := l0["statsUserDownlink"]; !ok {
		l0["statsUserDownlink"] = true
	}
	l0["statsUserOnline"] = true
	merged, err := json.Marshal(pol)
	if err != nil {
		return
	}
	cfg.Policy = json_util.RawMessage(merged)
}
