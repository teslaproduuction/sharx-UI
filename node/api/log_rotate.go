package api

import (
	"encoding/json"

	"github.com/konstpic/sharx-code/v2/logger"
)

func applyLogRotateFromJSON(raw json.RawMessage) {
	var payload struct {
		MaxSizeMB  int  `json:"maxSizeMB"`
		MaxAgeDays int  `json:"maxAgeDays"`
		MaxBackups int  `json:"maxBackups"`
		Compress   bool `json:"compress"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return
	}
	maxSize := payload.MaxSizeMB
	if maxSize <= 0 {
		maxSize = 50
	}
	maxAge := payload.MaxAgeDays
	if maxAge <= 0 {
		maxAge = 14
	}
	maxBackups := payload.MaxBackups
	if maxBackups <= 0 {
		maxBackups = 5
	}
	logger.ConfigureRotate(logger.RotateConfig{
		MaxSizeMB:  maxSize,
		MaxAgeDays: maxAge,
		MaxBackups: maxBackups,
		Compress:   payload.Compress,
	})
}
