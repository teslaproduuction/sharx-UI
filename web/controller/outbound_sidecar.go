// Phase 3 — OutboundSidecar HTTP API.
//
// CRUD + apply for sing-box client outbounds (cascade members). Mirrors the
// inbound controller shape: list / get / add / update / del. Each successful
// mutation triggers TryApplyLocalSingboxStandalone so the singleton sidecar
// picks up the new outbound + bridge inbound + route rule on the next SIGHUP.
package controller

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/web/service"
)

// OutboundSidecarController routes /panel/outbound-sidecar/*.
type OutboundSidecarController struct {
	BaseController
	svc service.OutboundSidecarService
}

// NewOutboundSidecarController wires routes onto the supplied gin RouterGroup.
func NewOutboundSidecarController(g *gin.RouterGroup) *OutboundSidecarController {
	c := &OutboundSidecarController{}
	c.initRouter(g)
	return c
}

func (c *OutboundSidecarController) initRouter(g *gin.RouterGroup) {
	g.GET("/list", c.list)
	g.GET("/get/:id", c.get)
	g.POST("/add", c.add)
	g.POST("/update/:id", c.update)
	g.POST("/del/:id", c.del)
	g.GET("/kinds", c.kinds)
	g.POST("/preview", c.preview)
}

func (c *OutboundSidecarController) list(ctx *gin.Context) {
	rows, err := c.svc.List(0)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": rows})
}

func (c *OutboundSidecarController) get(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	row, err := c.svc.Get(id)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": row})
}

func (c *OutboundSidecarController) add(ctx *gin.Context) {
	var sc model.OutboundSidecar
	if err := ctx.ShouldBindJSON(&sc); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	if err := c.svc.Create(&sc); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	// Multi-mode: workers also need the updated sing-box config (they hold
	// the sidecar runtime, not the panel host). RestartXrayAsync triggers
	// restartXrayMultiMode which pushes per-node envelopes including the
	// rebuilt sing-box payload. Standalone-mode: the local-apply call below
	// is the only path needed.
	xs := service.XrayService{}
	xs.RestartXrayAsync(false)
	service.TryApplyLocalSingboxStandalone(nil)
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": sc})
}

func (c *OutboundSidecarController) update(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	var sc model.OutboundSidecar
	if err := ctx.ShouldBindJSON(&sc); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	sc.Id = id
	if err := c.svc.Update(&sc); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	// Multi-mode: workers also need the updated sing-box config (they hold
	// the sidecar runtime, not the panel host). RestartXrayAsync triggers
	// restartXrayMultiMode which pushes per-node envelopes including the
	// rebuilt sing-box payload. Standalone-mode: the local-apply call below
	// is the only path needed.
	xs := service.XrayService{}
	xs.RestartXrayAsync(false)
	service.TryApplyLocalSingboxStandalone(nil)
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": sc})
}

func (c *OutboundSidecarController) del(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	if err := c.svc.Delete(id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	// Multi-mode: workers also need the updated sing-box config (they hold
	// the sidecar runtime, not the panel host). RestartXrayAsync triggers
	// restartXrayMultiMode which pushes per-node envelopes including the
	// rebuilt sing-box payload. Standalone-mode: the local-apply call below
	// is the only path needed.
	xs := service.XrayService{}
	xs.RestartXrayAsync(false)
	service.TryApplyLocalSingboxStandalone(nil)
	ctx.JSON(http.StatusOK, gin.H{"success": true})
}

func (c *OutboundSidecarController) kinds(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": service.SupportedKinds})
}

// preview accepts a candidate sidecar payload (not persisted) and returns the
// three sing-box fragments (outbound, bridge inbound, route rule) that would
// be spliced into the running config. Lets the UI render a "what you'll get"
// preview before saving, which surfaces malformed configs (missing required
// fields per kind) without a round-trip through Create + SIGHUP.
func (c *OutboundSidecarController) preview(ctx *gin.Context) {
	var sc model.OutboundSidecar
	if err := ctx.ShouldBindJSON(&sc); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	if sc.ListenPort <= 0 {
		sc.ListenPort = 43000
	}
	if strings.TrimSpace(sc.Name) == "" {
		sc.Name = "preview"
	}
	sc.Enable = true
	frag, err := service.BuildSingboxOutboundForSidecar(&sc)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{
		"outbound":      json.RawMessage(frag.Outbound),
		"bridgeInbound": json.RawMessage(frag.BridgeInbound),
		"routeRule":     json.RawMessage(frag.RouteRule),
	}})
}

// _ silences the unused-import warning on `strings` until we add validation.
var _ = strings.TrimSpace
