// Phase 2 — sing-box batch-reload queue HTTP endpoints.
//
// Read-only count + manual flush ("Apply pending now"). The flush triggers
// the same code path the inbound CRUD already uses (RestartXrayAsync →
// TryApplyLocalSingboxStandalone), so the panel UI can surface a banner
// + Apply button and reuse this without forking apply logic.
package controller

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/web/service"
)

// SingboxPendingController routes /panel/singbox/*.
type SingboxPendingController struct {
	BaseController
	svc          service.SingboxPendingService
	xrayService  service.XrayService
	cfgService   service.SingboxConfigService
}

// NewSingboxPendingController wires routes.
func NewSingboxPendingController(g *gin.RouterGroup) *SingboxPendingController {
	c := &SingboxPendingController{}
	c.initRouter(g)
	return c
}

func (c *SingboxPendingController) initRouter(g *gin.RouterGroup) {
	g.GET("/pending-count", c.pendingCount)
	g.POST("/apply-pending", c.applyPending)
	g.GET("/live-config", c.liveConfig)
}

// liveConfig returns the aggregated sing-box config the panel would push to
// the local sidecar right now (built from current DB state — same code path
// as the actual SIGHUP/spawn). Read-only; for "show me what's running" UI.
func (c *SingboxPendingController) liveConfig(ctx *gin.Context) {
	payload, err := c.cfgService.BuildSingboxConfigStandalone()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	var parsed any
	if len(payload.Cfg) > 0 {
		_ = json.Unmarshal([]byte(payload.Cfg), &parsed)
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{
		"config":     parsed,
		"configHash": payload.ConfigHash,
	}})
}

func (c *SingboxPendingController) pendingCount(ctx *gin.Context) {
	n, err := c.svc.PendingCount(0)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{"count": n}})
}

func (c *SingboxPendingController) applyPending(ctx *gin.Context) {
	// Apply = restart Xray (which also rebuilds the singleton sing-box config
	// from current DB state via TryApplyLocalSingboxStandalone). Then mark
	// the queue drained.
	c.xrayService.RestartXrayAsync(false)
	if err := c.svc.MarkAllApplied(0); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true})
}
