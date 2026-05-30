// Phase 5 — "Cores" inspector endpoints.
//
// Read-only dumps of the live config the panel would push *right now* for
// each core (xray / singbox / telemt). Frontend renders these as Monaco
// read-only viewers, so an admin can confirm what's actually running without
// SSH-ing into the host or chasing log lines.
package controller

import (
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/web/service"
)

// CoresController exposes /panel/cores/* read-only inspector endpoints.
type CoresController struct {
	BaseController
	singboxCfg service.SingboxConfigService
	xrayCfg    service.XrayService
}

// NewCoresController wires routes.
func NewCoresController(g *gin.RouterGroup) *CoresController {
	c := &CoresController{}
	c.initRouter(g)
	return c
}

func (c *CoresController) initRouter(g *gin.RouterGroup) {
	g.GET("/xray", c.xray)
	g.GET("/singbox", c.singbox)
	g.GET("/telemt", c.telemt)

	// Live status of all three cores (running / config hash / instance count).
	g.GET("/status", c.status)
	// Panel-host sidecar control + logs (singbox + telemt). Xray control reuses
	// the existing /server/* endpoints.
	g.POST("/singbox/stop", c.singboxStop)
	g.POST("/singbox/restart", c.singboxRestart)
	g.GET("/singbox/logs", c.singboxLogs)
	g.POST("/telemt/stop", c.telemtStop)
	g.POST("/telemt/restart", c.telemtRestart)
	g.GET("/telemt/logs", c.telemtLogs)
	// Telemt version switcher (prebuilt release tarballs — hot-swappable).
	g.GET("/telemt/versions", c.telemtVersions)
	g.POST("/telemt/install/:version", c.telemtInstall)

	// Phase 11 — :443 SNI router (Caddy layer4).
	g.GET("/sni/routes", c.sniRoutes)
	g.POST("/sni/sync", c.sniSync)
}

// sniRoutes returns the current SNI→backend map for the :443 router overview.
func (c *CoresController) sniRoutes(ctx *gin.Context) {
	routes, err := service.CollectSniRoutes()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ss := service.SettingService{}
	enabled, _ := ss.GetSniRouting443()
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{"enabled": enabled, "routes": routes}})
}

// sniSync force-pushes the layer4 config to Caddy's admin API (used after toggling
// the setting or editing inbound SNIs without a full Xray restart).
func (c *CoresController) sniSync(ctx *gin.Context) {
	service.PushLayer4ToCaddy()
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "SNI router synced"})
}

func (c *CoresController) telemtVersions(ctx *gin.Context) {
	vs, err := service.TelemtVersions()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": vs})
}

func (c *CoresController) telemtInstall(ctx *gin.Context) {
	version := ctx.Param("version")
	if err := service.InstallTelemtVersion(version); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "telemt " + version + " installed"})
}

// status reports liveness of each core for the unified Cores dashboard cards.
func (c *CoresController) status(ctx *gin.Context) {
	xrayRunning := c.xrayCfg.IsXrayRunning()
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{
		"xray": gin.H{
			"running": xrayRunning,
		},
		"singbox": gin.H{
			"running":    service.LocalSingboxRunning(),
			"configHash": service.LocalSingboxConfigHash(),
			"uptimeSec":  service.LocalSingboxUptimeSeconds(),
			"version":    service.LocalSingboxVersion(),
		},
		"telemt": gin.H{
			"running":       service.LocalTelemtSidecarCount() > 0,
			"instanceCount": service.LocalTelemtSidecarCount(),
			"uptimeSec":     service.LocalTelemtUptimeSeconds(),
			"version":       service.LocalTelemtVersion(),
		},
	}})
}

func (c *CoresController) singboxStop(ctx *gin.Context) {
	service.StopLocalSingboxStandalone()
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "sing-box stopped"})
}

func (c *CoresController) singboxRestart(ctx *gin.Context) {
	if err := service.ApplyLocalSingboxStandalone(nil); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "sing-box restarted"})
}

func (c *CoresController) singboxLogs(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": service.LocalSingboxLogs(500)})
}

func (c *CoresController) telemtStop(ctx *gin.Context) {
	service.StopLocalTelemtStandalone()
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "telemt stopped"})
}

func (c *CoresController) telemtRestart(ctx *gin.Context) {
	if err := service.ApplyLocalTelemtStandalone(nil); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "msg": "telemt restarted"})
}

func (c *CoresController) telemtLogs(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": service.LocalTelemtLogs(500)})
}

// xray returns the rendered xray config the panel would send to local xray.
// Equivalent to /panel/api/server/getConfigJson but lives under /cores for
// consistency with singbox + telemt; both endpoints stay supported.
func (c *CoresController) xray(ctx *gin.Context) {
	cfg, err := c.xrayCfg.GetXrayConfig()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": cfg})
}

func (c *CoresController) singbox(ctx *gin.Context) {
	payload, err := c.singboxCfg.BuildSingboxConfigStandalone()
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

// telemt returns the per-inbound TOML payloads the panel would push. Telemt
// is multi-instance (one process per Telemt inbound), so the response is an
// array, not a single blob.
func (c *CoresController) telemt(ctx *gin.Context) {
	payloads, err := service.BuildTelemtPayloadsStandalone()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": payloads})
}
