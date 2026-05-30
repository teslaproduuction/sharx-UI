package service

import (
	"path/filepath"
	"strings"
	"sync"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/telemt"
	"github.com/konstpic/sharx-code/v2/xray"
)

var (
	panelTelemtMu sync.Mutex
	panelTelemt   *telemt.Manager
)

func getPanelTelemt() *telemt.Manager {
	panelTelemtMu.Lock()
	defer panelTelemtMu.Unlock()
	if panelTelemt == nil {
		panelTelemt = telemt.NewManager()
		panelTelemt.SetWorkRoot(filepath.Join(config.GetDataFolderPath(), "telemt"))
	}
	return panelTelemt
}

// MergeLocalTelemtTrafficIntoXrayStats merges Telemt localhost API deltas into Xray-shaped stats (single-node panel).
func MergeLocalTelemtTrafficIntoXrayStats(traffic *[]*xray.Traffic, clientTraffic *[]*xray.ClientTraffic) {
	getPanelTelemt().MergeTelemtIntoNodeStats(traffic, clientTraffic, nil)
}

// StopLocalTelemtStandalone stops all Telemt sidecars managed by the panel process (standalone).
func StopLocalTelemtStandalone() {
	panelTelemtMu.Lock()
	defer panelTelemtMu.Unlock()
	if panelTelemt != nil {
		panelTelemt.Stop()
		panelTelemt = nil
	}
}

// StopLocalTelemtSidecars stops Telemt children on the panel host without niling the manager.
func StopLocalTelemtSidecars() {
	panelTelemtMu.Lock()
	defer panelTelemtMu.Unlock()
	if panelTelemt != nil {
		panelTelemt.Stop()
	}
}

// LocalTelemtSidecarCount returns supervised Telemt tags on this panel (0 if multi-node manager unused or none running).
func LocalTelemtSidecarCount() int {
	panelTelemtMu.Lock()
	defer panelTelemtMu.Unlock()
	if panelTelemt == nil {
		return 0
	}
	return panelTelemt.RunningCount()
}

func nodePayloadsToTelemt(in []TelemtNodePayload) []telemt.Payload {
	out := make([]telemt.Payload, 0, len(in))
	for _, p := range in {
		out = append(out, telemt.Payload{InboundId: p.InboundId, Tag: p.Tag, Toml: p.Toml})
	}
	return out
}

// ApplyLocalTelemtStandalone syncs Telemt processes on the panel host when multi-node mode is off.
func ApplyLocalTelemtStandalone(xs *XrayService) error {
	if xs == nil {
		xs = &XrayService{settingService: SettingService{}, inboundService: InboundService{}, nodeService: NodeService{}}
	}
	multi, err := xs.settingService.GetMultiNodeMode()
	if err != nil {
		multi = false
	}
	if multi {
		workload, _ := xs.settingService.GetPanelHostWorkload()
		if !workload {
			// Orchestrator-only: kill any leftover Telemt children so the process
			// tree matches the "no local workload" promise.
			StopLocalTelemtStandalone()
			return nil
		}
		// Hybrid: run only Telemt inbounds bound to the panel-host node (id=0).
		payloads, err := BuildTelemtPayloadsForPanelHost()
		if err != nil {
			return err
		}
		if len(payloads) == 0 {
			StopLocalTelemtStandalone()
			return nil
		}
		return getPanelTelemt().Apply(nodePayloadsToTelemt(payloads))
	}
	payloads, err := BuildTelemtPayloadsStandalone()
	if err != nil {
		return err
	}
	if len(payloads) == 0 {
		StopLocalTelemtStandalone()
		return nil
	}
	if err := getPanelTelemt().Apply(nodePayloadsToTelemt(payloads)); err != nil {
		return err
	}
	return nil
}

// CollectLocalTelemtOnlineSessions returns MTProto client IPs from Telemt Control API (standalone panel).
func CollectLocalTelemtOnlineSessions(email string) []xray.OnlineIPSession {
	return getPanelTelemt().CollectOnlineSessionsForUser(strings.TrimSpace(email))
}

// TryApplyLocalTelemtStandalone logs failures instead of returning (for defensive call sites).
func TryApplyLocalTelemtStandalone(xs *XrayService) {
	if err := ApplyLocalTelemtStandalone(xs); err != nil {
		logger.Warningf("standalone Telemt: %v", err)
	}
}
