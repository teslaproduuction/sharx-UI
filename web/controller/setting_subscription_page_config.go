package controller

import (
	"github.com/konstpic/sharx-code/v2/web/service"

	"github.com/gin-gonic/gin"
)

type subscriptionPageConfigGetForm struct {
	UUID string `json:"uuid" form:"uuid"`
}

type subscriptionPageConfigSaveForm struct {
	UUID       string `json:"uuid" form:"uuid"`
	Name       string `json:"name" form:"name"`
	ConfigJSON string `json:"configJson" form:"configJson"`
}

func (a *SettingController) subscriptionPageConfigList(c *gin.Context) {
	var svc service.SubscriptionPageConfigService
	if err := svc.EnsureDefault(); err != nil {
		jsonMsg(c, "", err)
		return
	}
	rows, err := svc.ListAll()
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	jsonObj(c, rows, nil)
}

func (a *SettingController) subscriptionPageConfigGet(c *gin.Context) {
	var form subscriptionPageConfigGetForm
	_ = c.ShouldBind(&form)
	var svc service.SubscriptionPageConfigService
	_ = svc.EnsureDefault()
	uuid := form.UUID
	if uuid == "" {
		uuid = svc.DefaultUUID()
	}
	row, err := svc.GetByUUID(uuid)
	if err != nil {
		jsonMsg(c, "", err)
		return
	}
	jsonObj(c, row, nil)
}

func (a *SettingController) subscriptionPageConfigSave(c *gin.Context) {
	var form subscriptionPageConfigSaveForm
	if err := c.ShouldBindJSON(&form); err != nil {
		if err2 := c.ShouldBind(&form); err2 != nil {
			jsonMsg(c, err.Error(), err2)
			return
		}
	}
	var svc service.SubscriptionPageConfigService
	uuid := form.UUID
	if uuid == "" {
		uuid = svc.DefaultUUID()
	}
	name := form.Name
	if name == "" {
		name = "Default"
	}
	err := svc.Save(uuid, name, form.ConfigJSON)
	jsonMsg(c, "", err)
}
