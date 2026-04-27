package xray

import (
	"encoding/json"

	"github.com/konstpic/sharx-code/v2/util/json_util"
)

// EnsureAPIServicesRoutingService appends "RoutingService" to config.api.services when missing,
// so RoutingService.AddRule / RemoveRule work without a full template migration.
func EnsureAPIServicesRoutingService(cfg *Config) {
	if cfg == nil || len(cfg.API) == 0 {
		return
	}
	var api map[string]interface{}
	if err := json.Unmarshal(cfg.API, &api); err != nil {
		return
	}
	services, ok := api["services"].([]interface{})
	if !ok || services == nil {
		services = []interface{}{}
	}
	for _, s := range services {
		if str, ok := s.(string); ok && str == "RoutingService" {
			return
		}
	}
	services = append(services, "RoutingService")
	api["services"] = services
	b, err := json.Marshal(api)
	if err != nil {
		return
	}
	cfg.API = json_util.RawMessage(b)
}
