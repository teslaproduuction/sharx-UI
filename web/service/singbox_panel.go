// Phase 2 — Panel-side wiring for the hiddify-sing-box singleton sidecar.
//
// In single-node (standalone) mode the panel runs the sing-box child process directly
// alongside the local Xray instance. In multi-node mode, the panel embeds the same
// aggregated config blob into the apply-config envelope sent to each worker (handled
// later in this branch via web/service/node.go ApplyConfigToNode).
//
// Symmetric to web/service/telemt_panel.go.
//
// See .agent/plans/phase-2-singbox-inbound.md.
package service

import (
	"path/filepath"
	"sync"

	"github.com/konstpic/sharx-code/v2/config"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/sidecarlog"
	"github.com/konstpic/sharx-code/v2/node/singbox"
)

// LocalSingboxLogs returns up to the last n stdout/stderr lines of the panel-host
// sing-box child (empty if it has never started).
func LocalSingboxLogs(n int) []sidecarlog.Line {
	panelSingboxMu.Lock()
	mgr := panelSingbox
	panelSingboxMu.Unlock()
	if mgr == nil {
		return []sidecarlog.Line{}
	}
	return mgr.Logs(n)
}

var (
	panelSingboxMu sync.Mutex
	panelSingbox   *singbox.Manager
)

func getPanelSingbox() *singbox.Manager {
	panelSingboxMu.Lock()
	defer panelSingboxMu.Unlock()
	if panelSingbox == nil {
		panelSingbox = singbox.NewManager()
		panelSingbox.SetWorkRoot(filepath.Join(config.GetDataFolderPath(), "singbox"))
	}
	return panelSingbox
}

// StopLocalSingboxStandalone stops the sing-box child managed by the panel host (standalone).
func StopLocalSingboxStandalone() {
	panelSingboxMu.Lock()
	defer panelSingboxMu.Unlock()
	if panelSingbox != nil {
		panelSingbox.Stop()
		panelSingbox = nil
	}
}

// StopLocalSingboxSidecar stops the panel-host sing-box without niling the manager.
// Used by RestartXray to clean up before a multi-node mode switch.
func StopLocalSingboxSidecar() {
	panelSingboxMu.Lock()
	defer panelSingboxMu.Unlock()
	if panelSingbox != nil {
		panelSingbox.Stop()
	}
}

// LocalSingboxRunning returns whether the panel-host sing-box is currently alive.
func LocalSingboxRunning() bool {
	panelSingboxMu.Lock()
	defer panelSingboxMu.Unlock()
	if panelSingbox == nil {
		return false
	}
	return panelSingbox.RunningCount() > 0
}

// LocalSingboxConfigHash returns the sha256 of the last-applied aggregated
// sing-box config blob (empty before first Apply). Used by the dashboard
// status card to surface drift between what the panel built and what the
// sidecar is actually running.
func LocalSingboxConfigHash() string {
	panelSingboxMu.Lock()
	defer panelSingboxMu.Unlock()
	if panelSingbox == nil {
		return ""
	}
	return panelSingbox.ConfigHash()
}

// ApplyLocalSingboxStandalone rebuilds the aggregated sing-box config from DB
// and pushes it into the local manager.
//
// Behavior by mode:
//   - Standalone (multi-node OFF): include every enabled sing-box inbound +
//     OutboundSidecar — there's only one host.
//   - Multi-node (multi-node ON): the panel host acts as the "cascade hub" —
//     it runs only the inbounds + sidecars that are NOT assigned to any worker
//     (NodeIds empty). Items assigned to workers travel via apply-config
//     envelope. Empty config → stop the local sidecar.
//
// This lets operators put the entry inbound (e.g. vless on the RU panel host)
// + the cascade outbound (mieru-client → IN worker) on the panel and route
// traffic RU→IN without registering the panel as its own worker container.
func ApplyLocalSingboxStandalone(xs *XrayService) error {
	if xs == nil {
		xs = &XrayService{settingService: SettingService{}, inboundService: InboundService{}, nodeService: NodeService{}}
	}
	cfgSvc := SingboxConfigService{
		inboundService: xs.inboundService,
		settingService: xs.settingService,
	}
	payload, err := cfgSvc.BuildSingboxConfigStandalone()
	if err != nil {
		return err
	}
	if payload.IsEmpty() {
		StopLocalSingboxStandalone()
		return nil
	}
	return getPanelSingbox().Apply(singbox.Payload{
		Cfg:        payload.Cfg,
		ConfigHash: payload.ConfigHash,
	})
}

// TryApplyLocalSingboxStandalone is the fire-and-log variant for callers that
// must not propagate sing-box failures (e.g. RestartXray which already returned
// success for the Xray part).
func TryApplyLocalSingboxStandalone(xs *XrayService) {
	if err := ApplyLocalSingboxStandalone(xs); err != nil {
		logger.Warningf("standalone sing-box: %v", err)
	}
}
