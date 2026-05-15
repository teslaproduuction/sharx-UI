// Phase 4 — OutboundChain HTTP API.
package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/web/service"
)

// OutboundChainController routes /panel/outbound-chain/*.
type OutboundChainController struct {
	BaseController
	svc service.OutboundChainService
}

// NewOutboundChainController wires routes.
func NewOutboundChainController(g *gin.RouterGroup) *OutboundChainController {
	c := &OutboundChainController{}
	c.initRouter(g)
	return c
}

func (c *OutboundChainController) initRouter(g *gin.RouterGroup) {
	g.GET("/list", c.list)
	g.GET("/get/:id", c.get)
	g.POST("/add", c.add)
	g.POST("/update/:id", c.update)
	g.POST("/del/:id", c.del)
	g.GET("/strategies", c.strategies)
}

func (c *OutboundChainController) list(ctx *gin.Context) {
	rows, err := c.svc.List()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": rows})
}

func (c *OutboundChainController) get(ctx *gin.Context) {
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

func (c *OutboundChainController) add(ctx *gin.Context) {
	var ch model.OutboundChain
	if err := ctx.ShouldBindJSON(&ch); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	if err := c.svc.Create(&ch); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": ch})
}

func (c *OutboundChainController) update(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	var ch model.OutboundChain
	if err := ctx.ShouldBindJSON(&ch); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ch.Id = id
	if err := c.svc.Update(&ch); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": ch})
}

func (c *OutboundChainController) del(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	if err := c.svc.Delete(id); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true})
}

func (c *OutboundChainController) strategies(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": service.SupportedChainStrategies})
}
