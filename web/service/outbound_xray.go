// MergeOutboundsIntoXrayConfig appends model.Outbound rows (DB-managed) into
// xrayConfig.OutboundConfigs. Without this, sidecar-auto-created socks-out
// outbounds (e.g. "hub-to-india-local") exist in DB but never reach the running
// xray binary, so routing rules referencing them never match.
//
// Existing tags in the template (direct/api/blocked) are preserved; DB rows with
// duplicate tag are skipped so the admin's hand-edited template can override.
package service

import (
	"encoding/json"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"
)

func MergeOutboundsIntoXrayConfig(cfg *xray.Config) error {
	if cfg == nil {
		return nil
	}
	svc := OutboundService{}
	rows, err := svc.GetAllOutbounds()
	if err != nil {
		logger.Warningf("xray outbound merge: list: %v", err)
		return nil
	}
	if len(rows) == 0 {
		return nil
	}

	var existing []map[string]any
	if len(cfg.OutboundConfigs) > 0 {
		_ = json.Unmarshal(cfg.OutboundConfigs, &existing)
	}
	seen := make(map[string]struct{}, len(existing))
	for _, o := range existing {
		if t, ok := o["tag"].(string); ok && t != "" {
			seen[t] = struct{}{}
		}
	}

	for _, ob := range rows {
		if ob == nil || !ob.Enable {
			continue
		}
		tag := strings.TrimSpace(ob.Tag)
		if tag == "" {
			continue
		}
		if _, dup := seen[tag]; dup {
			continue
		}
		entry := outboundRowToConfig(ob)
		if entry == nil {
			continue
		}
		existing = append(existing, entry)
		seen[tag] = struct{}{}
	}

	cfg.OutboundConfigs = mustMarshalJSONUtil(existing)
	return nil
}

func outboundRowToConfig(ob *model.Outbound) map[string]any {
	out := map[string]any{
		"tag":      ob.Tag,
		"protocol": ob.Protocol,
	}
	if s := strings.TrimSpace(ob.Settings); s != "" {
		var v any
		if err := json.Unmarshal([]byte(s), &v); err == nil {
			out["settings"] = v
		}
	}
	if s := strings.TrimSpace(ob.StreamSettings); s != "" {
		var v any
		if err := json.Unmarshal([]byte(s), &v); err == nil {
			out["streamSettings"] = v
		}
	}
	if s := strings.TrimSpace(ob.ProxySettings); s != "" {
		var v any
		if err := json.Unmarshal([]byte(s), &v); err == nil {
			out["proxySettings"] = v
		}
	}
	if s := strings.TrimSpace(ob.Mux); s != "" {
		var v any
		if err := json.Unmarshal([]byte(s), &v); err == nil {
			out["mux"] = v
		}
	}
	if s := strings.TrimSpace(ob.SendThrough); s != "" {
		out["sendThrough"] = s
	}
	return out
}
