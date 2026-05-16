// Phase 4 Build path — merge OutboundChain rows into Xray routing.balancers +
// observatory blocks at GetXrayConfig time.
//
// Each enabled chain compiles to:
//   routing.balancers[]: {tag: <chain.name>, selector: [<member tags>], strategy: {type: leastPing|random|...}}
//   observatory.subjectSelector[]: <chain.name> (so Xray probes each member)
//
// The router rule layer is unchanged — admins still target a chain by writing
// `balancerTag: <chain.name>` in their existing routing rules. We only build
// the balancer + observatory wiring; rules stay author-controlled.
//
// See .agent/plans/phase-4-cascade.md.
package service

import (
	"encoding/json"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/json_util"
	"github.com/konstpic/sharx-code/v2/xray"
)

// MergeChainsIntoXrayConfig appends balancer entries + observatory subjects for
// every enabled OutboundChain. Returns nil on success; never errors out — a
// malformed chain row is logged + skipped so one bad row cannot break the
// entire Xray config push.
func MergeChainsIntoXrayConfig(cfg *xray.Config) error {
	if cfg == nil {
		return nil
	}
	svc := OutboundChainService{}
	chains, err := svc.List()
	if err != nil {
		logger.Warningf("xray chain merge: list chains: %v", err)
		return nil
	}
	if len(chains) == 0 {
		return nil
	}

	// Routing balancers — splice into existing routing.balancers[] (or create).
	var routing map[string]any
	if len(cfg.RouterConfig) > 0 {
		_ = json.Unmarshal(cfg.RouterConfig, &routing)
	}
	if routing == nil {
		routing = map[string]any{}
	}
	balancers, _ := routing["balancers"].([]any)

	// Observatory — track which subject tags must be probed.
	var observatory map[string]any
	if len(cfg.Observatory) > 0 {
		_ = json.Unmarshal(cfg.Observatory, &observatory)
	}
	if observatory == nil {
		observatory = map[string]any{}
	}
	subjects, _ := observatory["subjectSelector"].([]any)
	subjectSet := make(map[string]struct{}, len(subjects))
	for _, s := range subjects {
		if str, ok := s.(string); ok {
			subjectSet[str] = struct{}{}
		}
	}

	for _, ch := range chains {
		if ch == nil || !ch.Enable {
			continue
		}
		tag := strings.TrimSpace(ch.Name)
		if tag == "" {
			continue
		}
		selector := chainSelectorTags(ch)
		if len(selector) == 0 {
			logger.Warningf("xray chain merge: chain id=%d name=%q has no members, skipping", ch.Id, ch.Name)
			continue
		}
		strategy := strings.TrimSpace(ch.Strategy)
		if strategy == "" {
			strategy = "leastPing"
		}
		balancers = append(balancers, map[string]any{
			"tag":      tag,
			"selector": selector,
			"strategy": map[string]any{"type": strategy},
		})
		// Observatory probes each member tag — Xray watches them and chooses
		// the lowest-ping subject for the leastPing strategy.
		for _, m := range selector {
			if _, dup := subjectSet[m]; !dup {
				subjects = append(subjects, m)
				subjectSet[m] = struct{}{}
			}
		}
	}

	routing["balancers"] = balancers
	cfg.RouterConfig = mustMarshalJSONUtil(routing)

	if len(subjects) > 0 {
		observatory["subjectSelector"] = subjects
		if _, has := observatory["probeURL"]; !has {
			// Pick the probe URL from the first chain that has one.
			for _, ch := range chains {
				if ch != nil && ch.ProbeURL != "" {
					observatory["probeURL"] = ch.ProbeURL
					break
				}
			}
		}
		if _, has := observatory["probeInterval"]; !has {
			// Default 5min — keeps probes cheap when a chain member is offline
			// (Xray retries every interval; tight intervals on a bogus exit
			// burn CPU on DNS/connect retries). Per-chain interval can override.
			observatory["probeInterval"] = "300s"
		}
		cfg.Observatory = mustMarshalJSONUtil(observatory)
	}
	return nil
}

func chainSelectorTags(ch *model.OutboundChain) []string {
	if ch == nil {
		return nil
	}
	out := make([]string, 0, len(ch.Members))
	seen := make(map[string]struct{}, len(ch.Members))
	for _, m := range ch.Members {
		t := strings.TrimSpace(m.OutboundTag)
		if t == "" {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func mustMarshalJSONUtil(v any) json_util.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json_util.RawMessage("{}")
	}
	return json_util.RawMessage(b)
}
