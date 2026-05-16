// Phase 7 — Cloudflare HTTP API.
package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/web/service"
)

// CloudflareController routes /panel/cloudflare/*.
type CloudflareController struct {
	BaseController
	svc service.CloudflareService
}

// NewCloudflareController wires routes.
func NewCloudflareController(g *gin.RouterGroup) *CloudflareController {
	c := &CloudflareController{}
	c.initRouter(g)
	return c
}

func (c *CloudflareController) initRouter(g *gin.RouterGroup) {
	g.GET("/credentials", c.listCredentials)
	g.POST("/credentials", c.addCredential)
	g.POST("/credentials/:id/verify", c.verifyCredential)
	g.POST("/credentials/:id/sync-zones", c.syncZones)
	g.POST("/credentials/:id/del", c.deleteCredential)
	g.GET("/domains", c.listDomains)
	g.POST("/domains", c.addDomain)
	g.POST("/domains/:id/del", c.deleteDomain)
}

func (c *CloudflareController) listCredentials(ctx *gin.Context) {
	rows, err := c.svc.ListCredentials()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": rows})
}

type cfCredentialBody struct {
	Name     string `json:"name"`
	APIToken string `json:"apiToken"`
}

func (c *CloudflareController) addCredential(ctx *gin.Context) {
	var body cfCredentialBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	row, err := c.svc.AddCredential(body.Name, body.APIToken)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	row.APIToken = ""
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": row})
}

func (c *CloudflareController) verifyCredential(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	resp, err := c.svc.VerifyCredential(id)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": resp})
}

func (c *CloudflareController) syncZones(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	n, err := c.svc.SyncZones(id)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{"count": n}})
}

func (c *CloudflareController) deleteCredential(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	if err := c.svc.DeleteCredential(id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true})
}

func (c *CloudflareController) listDomains(ctx *gin.Context) {
	rows, err := c.svc.ListDomains()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": rows})
}

func (c *CloudflareController) addDomain(ctx *gin.Context) {
	var d model.CloudflareDomain
	if err := ctx.ShouldBindJSON(&d); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	if err := c.svc.AddDomain(&d); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": d})
}

func (c *CloudflareController) deleteDomain(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	if err := c.svc.DeleteDomain(id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true})
}
