// Package main is the entry point for the SharX node service (worker).
// This service runs XRAY Core and provides a REST API for the master panel to manage it.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/api"
	"github.com/konstpic/sharx-code/v2/node/auth"
	nodeConfig "github.com/konstpic/sharx-code/v2/node/config"
	"github.com/konstpic/sharx-code/v2/node/defaults"
	nodeLogs "github.com/konstpic/sharx-code/v2/node/logs"
	"github.com/konstpic/sharx-code/v2/node/xray"
	"github.com/op/go-logging"
)


func main() {
	var port int
	var apiKey string
	flag.IntVar(&port, "port", defaults.APIListenPort, "API server port (default "+fmt.Sprint(defaults.APIListenPort)+", host network)")
	flag.StringVar(&apiKey, "api-key", "", "API key for authentication (optional, can be set via registration)")
	flag.Parse()

	logger.InitLogger(logging.INFO)

	// Initialize node configuration system
	// Try to find config directory (same as XRAY config)
	configDirs := []string{"bin", "config", ".", "/app/bin", "/app/config"}
	var configDir string
	for _, dir := range configDirs {
		if _, err := os.Stat(dir); err == nil {
			configDir = dir
			break
		}
	}
	if configDir == "" {
		configDir = "." // Fallback
	}

	if err := nodeConfig.InitConfig(configDir); err != nil {
		log.Fatalf("Failed to initialize node config: %v", err)
	}

	// Get API key from (in order of priority):
	// 1. Command line flag
	// 2. Environment variable (for backward compatibility)
	// 3. Saved config file (from registration)
	if apiKey == "" {
		apiKey = os.Getenv("NODE_API_KEY")
	}
	if apiKey == "" {
		// Try to load from saved config
		savedConfig := nodeConfig.GetConfig()
		if savedConfig.ApiKey != "" {
			apiKey = savedConfig.ApiKey
			log.Printf("Using API key from saved configuration")
		}
	}

	bundle, err := auth.LoadBundleFromEnv()
	if err != nil {
		log.Fatalf("SECRET_KEY / SHARX_NODE_SECRET_KEY: %v", err)
	}

	if bundle == nil {
		// No SECRET_KEY: legacy mode — need API key or /api/v1/register
		if apiKey == "" {
			log.Printf("WARNING: No API key found. Register once via /api/v1/register or set NODE_API_KEY / -api-key")
			apiKey = "temp-unregistered"
		}
	} else {
		// SECRET_KEY bundle: panel uses JWT + mTLS; no registration call required
		if apiKey == "" {
			apiKey = "temp-unregistered"
		}
	}

	// Initialize log pusher if panel URL is configured
	// Get node address from saved config or environment variable
	savedConfig := nodeConfig.GetConfig()
	nodeAddress := savedConfig.NodeAddress
	if nodeAddress == "" {
		nodeAddress = os.Getenv("NODE_ADDRESS")
	}
	if nodeAddress == "" {
		// Default to localhost with the port (panel will match by port if address doesn't match exactly)
		nodeAddress = fmt.Sprintf("http://127.0.0.1:%d", port)
	}
	
	// Get panel URL from saved config or environment variable
	panelURL := savedConfig.PanelURL
	if panelURL == "" {
		panelURL = os.Getenv("PANEL_URL")
	}
	
	nodeLogs.InitLogPusher(nodeAddress)
	if panelURL != "" {
		nodeLogs.SetPanelURL(panelURL)
	}
	// Connect log pusher to logger
	logger.SetLogPusher(nodeLogs.PushLog)

	xrayManager := xray.NewManager()
	server := api.NewServer(port, apiKey, xrayManager)

	if bundle != nil {
		server.SetPairing(bundle)
		log.Printf("SECRET_KEY: serving API with TLS + mTLS + JWT (no panel registration required); optional NODE_API_KEY / PANEL_URL for logs")
	} else {
		certFile := os.Getenv("NODE_TLS_CERT_FILE")
		keyFile := os.Getenv("NODE_TLS_KEY_FILE")
		if certFile != "" && keyFile != "" {
			server.SetTLS(certFile, keyFile)
			log.Printf("HTTPS enabled: cert=%s, key=%s", certFile, keyFile)
			if clientCA := os.Getenv("NODE_TLS_CLIENT_CA_FILE"); clientCA != "" {
				server.SetMTLSClientCA(clientCA)
				log.Printf("mTLS: panel client certs must chain to CA file %s", clientCA)
			}
		}
	}

	log.Printf("Starting SharX Node Service on port %d", port)
	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("Shutting down...")
	xrayManager.Stop()
	server.Stop()
	log.Println("Shutdown complete")
}
