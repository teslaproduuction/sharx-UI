// Phase 1 — REST endpoints for the Caddy front-door masking settings.
// See web/service/panel_security.go and .agent/plans/phase-1-caddy-masking.md.
package controller

import (
	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/web/service"
)

// PanelSecurityController exposes /panel/api/setting/security/* endpoints.
type PanelSecurityController struct {
	svc service.PanelSecurityService
}

// NewPanelSecurityController wires the routes onto an existing settings router group.
// Routes are nested under /setting/security so the existing auth middleware applies unchanged.
func NewPanelSecurityController(g *gin.RouterGroup) *PanelSecurityController {
	c := &PanelSecurityController{}
	c.initRouter(g)
	return c
}

func (c *PanelSecurityController) initRouter(g *gin.RouterGroup) {
	r := g.Group("/security")

	r.GET("/status", c.getStatus)
	r.POST("/rotate-prefix", c.rotateSecretPrefix)
	r.POST("/decoy-url", c.setDecoyURL)
	r.POST("/mascaraed-hours", c.setMascaraedAfterHours)
	r.POST("/activate-mascaraed-now", c.activateMascaraedNow)
}

func (c *PanelSecurityController) getStatus(g *gin.Context) {
	status, err := c.svc.GetStatus()
	jsonObj(g, status, err)
}

func (c *PanelSecurityController) rotateSecretPrefix(g *gin.Context) {
	prefix, err := c.svc.RotateSecretPrefix()
	if err != nil {
		jsonMsg(g, "rotate secret prefix", err)
		return
	}
	jsonObj(g, gin.H{"secretPrefix": prefix, "caddyReloadHint": "docker compose restart caddy"}, nil)
}

type setDecoyURLForm struct {
	URL string `json:"url" form:"url" binding:"required"`
}

func (c *PanelSecurityController) setDecoyURL(g *gin.Context) {
	form := &setDecoyURLForm{}
	if err := g.ShouldBind(form); err != nil {
		jsonMsg(g, "set decoy URL", err)
		return
	}
	if err := c.svc.SetDecoyURL(form.URL); err != nil {
		jsonMsg(g, "set decoy URL", err)
		return
	}
	jsonObj(g, gin.H{"decoyURL": form.URL, "caddyReloadHint": "docker compose restart caddy"}, nil)
}

type setMascaraedHoursForm struct {
	Hours int `json:"hours" form:"hours"`
}

func (c *PanelSecurityController) setMascaraedAfterHours(g *gin.Context) {
	form := &setMascaraedHoursForm{}
	if err := g.ShouldBind(form); err != nil {
		jsonMsg(g, "set mascaraed hours", err)
		return
	}
	if err := c.svc.SetMascaraedAfterHours(form.Hours); err != nil {
		jsonMsg(g, "set mascaraed hours", err)
		return
	}
	jsonObj(g, gin.H{"mascaraedAfterHours": form.Hours}, nil)
}

func (c *PanelSecurityController) activateMascaraedNow(g *gin.Context) {
	if err := c.svc.ActivateMascaraedNow(); err != nil {
		jsonMsg(g, "activate mascaraed now", err)
		return
	}
	jsonObj(g, gin.H{"activated": true}, nil)
}
