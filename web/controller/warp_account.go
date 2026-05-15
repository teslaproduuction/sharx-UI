// Phase 3 Part B — multi-account WARP HTTP API.
package controller

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/konstpic/sharx-code/v2/web/service"
)

// WarpAccountController routes /panel/warp-account/*.
type WarpAccountController struct {
	BaseController
	svc service.WarpAccountService
}

// NewWarpAccountController wires routes.
func NewWarpAccountController(g *gin.RouterGroup) *WarpAccountController {
	c := &WarpAccountController{}
	c.initRouter(g)
	return c
}

func (c *WarpAccountController) initRouter(g *gin.RouterGroup) {
	g.GET("/list", c.list)
	g.GET("/get/:id", c.get)
	g.GET("/outbound-json/:id", c.outboundJSON)
	g.POST("/register", c.register)
	g.PUT("/license/:id", c.applyLicense)
	g.POST("/del/:id", c.del)
}

type warpRegisterBody struct {
	Name string `json:"name"`
}

func (c *WarpAccountController) register(ctx *gin.Context) {
	var body warpRegisterBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	row, err := c.svc.Register(body.Name)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": row})
}

func (c *WarpAccountController) list(ctx *gin.Context) {
	rows, err := c.svc.List()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": rows})
}

func (c *WarpAccountController) get(ctx *gin.Context) {
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

func (c *WarpAccountController) outboundJSON(ctx *gin.Context) {
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
	js, err := c.svc.BuildXrayOutboundJSON(row)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": gin.H{"json": js}})
}

type warpLicenseBody struct {
	License string `json:"license"`
}

func (c *WarpAccountController) applyLicense(ctx *gin.Context) {
	id, err := strconv.Atoi(ctx.Param("id"))
	if err != nil || id <= 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": "invalid id"})
		return
	}
	var body warpLicenseBody
	if err := ctx.ShouldBindJSON(&body); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	row, err := c.svc.ApplyPlusLicense(id, body.License)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"success": false, "msg": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "obj": row})
}

func (c *WarpAccountController) del(ctx *gin.Context) {
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
