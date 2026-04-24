package model

// SubscriptionPageConfig stores JSON for the first-party subscription page builder (sharx-v1 schema).
type SubscriptionPageConfig struct {
	UUID         string `json:"uuid" gorm:"primaryKey;column:uuid;type:char(36)"`
	ViewPosition int    `json:"viewPosition" gorm:"column:view_position"`
	Name         string `json:"name" gorm:"column:name"`
	ConfigJSON   string `json:"configJson" gorm:"column:config_json;type:jsonb"`
	CreatedAt    int64  `json:"createdAt" gorm:"column:created_at;autoCreateTime"`
	UpdatedAt    int64  `json:"updatedAt" gorm:"column:updated_at;autoUpdateTime"`
}

// TableName returns the DB table name for GORM.
func (SubscriptionPageConfig) TableName() string {
	return "subscription_page_configs"
}
