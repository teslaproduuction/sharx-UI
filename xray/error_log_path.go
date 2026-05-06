package xray

import (
	"encoding/json"
	"os"

	"github.com/konstpic/sharx-code/v2/logger"
)

// GetErrorLogPath reads the Xray config and returns the error log file path.
// Returns an error if the config file doesn't exist (e.g., in multi-node mode).
func GetErrorLogPath() (string, error) {
	configPath := GetConfigPath()
	cfgBytes, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", err
		}
		logger.Warningf("Failed to read configuration file: %s", err)
		return "", err
	}

	jsonConfig := map[string]any{}
	if err := json.Unmarshal(cfgBytes, &jsonConfig); err != nil {
		logger.Warningf("Failed to parse JSON configuration: %s", err)
		return "", err
	}

	if jsonConfig["log"] != nil {
		if jsonLog, ok := jsonConfig["log"].(map[string]any); ok {
			if jsonLog["error"] != nil {
				if p, ok := jsonLog["error"].(string); ok {
					return p, nil
				}
			}
		}
	}
	return "", nil
}
