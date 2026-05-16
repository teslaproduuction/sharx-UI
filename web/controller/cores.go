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
