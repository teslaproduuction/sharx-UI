// Package config provides node configuration persistence (panel URL, node address).
package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// NodeConfig represents the node's configuration stored on disk.
type NodeConfig struct {
	PanelURL    string `json:"panelUrl"`
	NodeAddress string `json:"nodeAddress"`
}

var (
	config     *NodeConfig
	configMu   sync.RWMutex
	configPath string
)

// InitConfig initializes the configuration system and loads existing config if available.
func InitConfig(configDir string) error {
	configMu.Lock()
	defer configMu.Unlock()

	if configDir == "" {
		possibleDirs := []string{"bin", "config", ".", "/app/bin", "/app/config"}
		for _, dir := range possibleDirs {
			if _, err := os.Stat(dir); err == nil {
				configDir = dir
				break
			}
		}
		if configDir == "" {
			configDir = "."
		}
	}

	configPath = filepath.Join(configDir, "node-config.json")

	if data, err := os.ReadFile(configPath); err == nil {
		var loadedConfig NodeConfig
		if err := json.Unmarshal(data, &loadedConfig); err == nil {
			config = &loadedConfig
			return nil
		}
	}

	config = &NodeConfig{}
	return nil
}

// GetConfig returns the current node configuration.
func GetConfig() *NodeConfig {
	configMu.RLock()
	defer configMu.RUnlock()

	if config == nil {
		return &NodeConfig{}
	}

	return &NodeConfig{
		PanelURL:    config.PanelURL,
		NodeAddress: config.NodeAddress,
	}
}

// SetPanelURL sets the panel URL and saves it to disk.
func SetPanelURL(url string) error {
	configMu.Lock()
	defer configMu.Unlock()

	if config == nil {
		config = &NodeConfig{}
	}

	config.PanelURL = url
	return saveConfig()
}

// SetNodeAddress sets the node address and saves it to disk.
func SetNodeAddress(address string) error {
	configMu.Lock()
	defer configMu.Unlock()

	if config == nil {
		config = &NodeConfig{}
	}

	config.NodeAddress = address
	return saveConfig()
}

func saveConfig() error {
	if configPath == "" {
		return fmt.Errorf("config path not initialized, call InitConfig first")
	}

	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0750); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal config: %w", err)
	}

	if err := os.WriteFile(configPath, data, 0600); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	return nil
}

// GetConfigPath returns the path to the config file.
func GetConfigPath() string {
	configMu.RLock()
	defer configMu.RUnlock()
	return configPath
}
