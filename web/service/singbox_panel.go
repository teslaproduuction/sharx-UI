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
	"github.com/konstpic/sharx-code/v2/node/singbox"
)

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

// ApplyLocalSingboxStandalone rebuilds the aggregated sing-box config from DB
// and pushes it into the local manager (which writes config.json + SIGHUPs the child).
// In multi-node mode, this function is a no-op — workers receive the config via
// the apply-config envelope (Phase 2 follow-up commit).
func ApplyLocalSingboxStandalone(xs *XrayService) error {
	if xs == nil {
		xs = &XrayService{settingService: SettingService{}, inboundService: InboundService{}, nodeService: NodeService{}}
	}
	multi, err := xs.settingService.GetMultiNodeMode()
	if err != nil {
		multi = false
	}
	if multi {
		return nil
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
