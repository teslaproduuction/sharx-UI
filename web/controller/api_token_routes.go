package controller

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/web/service"
	"github.com/konstpic/sharx-code/v2/web/session"
)

type apiTokenCreateForm struct {
	Name string `json:"name"`
}

type apiTokenRevokeByIDForm struct {
	ID int `json:"id"`
}

type apiTokenListItem struct {
	ID         int    `json:"id"`
	Name       string `json:"name"`
	CreatedAt  int64  `json:"createdAt"`
	LastUsedAt *int64 `json:"lastUsedAt,omitempty"`
}

// registerAPITokenRoutes must be used inside a group that already enforces checkAPIAuth.
func (a *APIController) registerAPITokenRoutes(api *gin.RouterGroup) {
	t := api.Group("/tokens")
	t.GET("/list", a.listAPITokens)
	t.POST("/create", a.createAPIToken)
	t.POST("/revoke", a.revokeAPIToken)
}

func (a *APIController) listAPITokens(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(404)
		return
	}
	svc := service.APITokenService{}
	rows, err := svc.ListAPITokens(user.Id)
	if err != nil {
		jsonMsg(c, "Failed to list API tokens", err)
		return
	}
	out := make([]apiTokenListItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, apiTokenListItem{
			ID:         r.Id,
			Name:       r.Name,
			CreatedAt:  r.CreatedAt,
			LastUsedAt: r.LastUsedAt,
		})
	}
	jsonObj(c, out, nil)
}

func (a *APIController) createAPIToken(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(404)
		return
	}
	var form apiTokenCreateForm
	_ = c.ShouldBindJSON(&form)
	svc := service.APITokenService{}
	tok, row, err := svc.CreateAPIToken(user.Id, form.Name)
	if err != nil {
		jsonMsg(c, "Failed to create API token", err)
		return
	}
	jsonObj(c, map[string]any{
		"token": tok,
		"id":    row.Id,
		"name":  row.Name,
	}, nil)
}

func (a *APIController) revokeAPIToken(c *gin.Context) {
	user := session.GetLoginUser(c)
	if user == nil {
		c.AbortWithStatus(404)
		return
	}
	var form apiTokenRevokeByIDForm
	if err := c.ShouldBindJSON(&form); err != nil || form.ID < 1 {
		jsonMsg(c, "Invalid id", errors.New("required"))
		return
	}
	svc := service.APITokenService{}
	if err := svc.RevokeAPITokenByID(user.Id, form.ID); err != nil {
		if database.IsNotFound(err) {
			jsonMsg(c, "Token not found", err)
		} else {
			jsonMsg(c, "Failed to revoke", err)
		}
		return
	}
	jsonMsg(c, "Revoked", nil)
}

// TryAttachAPITokenFromBearer is used by public middleware (API group, panel login, WebSocket).
func TryAttachAPITokenFromBearer(c *gin.Context) {
	(&service.APITokenService{}).TryAttachUserFromBearer(c)
}
