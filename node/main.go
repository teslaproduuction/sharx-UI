// Package main is the entry point for the SharX node service (worker).
// This service runs XRAY Core and provides a REST API for the master panel to manage it.
// Authentication is pairing-only: SECRET_KEY (TLS + mTLS + JWT); log push uses HMAC.
package main

import (
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/api"
	"github.com/konstpic/sharx-code/v2/node/auth"
	nodeConfig "github.com/konstpic/sharx-code/v2/node/config"
	"github.com/konstpic/sharx-code/v2/node/configpull"
	"github.com/konstpic/sharx-code/v2/node/defaults"
	"github.com/konstpic/sharx-code/v2/node/geopush"
	nodeLogs "github.com/konstpic/sharx-code/v2/node/logs"
	"github.com/konstpic/sharx-code/v2/node/xray"
	"github.com/konstpic/sharx-code/v2/util/pairing_outbound"
	"github.com/op/go-logging"
)

func main() {
	var port int
	flag.IntVar(&port, "port", defaults.APIListenPort, "API server port (default "+fmt.Sprint(defaults.APIListenPort)+", host network)")
	flag.Parse()

	logger.InitLogger(logging.INFO)

	configDirs := []string{"bin", "config", ".", "/app/bin", "/app/config"}
	var configDir string
	for _, dir := range configDirs {
		if _, err := os.Stat(dir); err == nil {
			configDir = dir
			break
		}
	}
	if configDir == "" {
		configDir = "."
	}

	if err := nodeConfig.InitConfig(configDir); err != nil {
		log.Fatalf("Failed to initialize node config: %v", err)
	}

	bundle, err := auth.LoadBundleFromEnv()
	if err != nil {
		log.Fatalf("SECRET_KEY: %v", err)
	}
	if bundle == nil {
		log.Fatalf("SECRET_KEY is required (set env SECRET_KEY to the base64 JSON bundle from the panel)")
	}
	h := pairing_outbound.OutboundHMACKey(bundle.Payload.CACertPem, bundle.Payload.JWTPublicKey)
	nodeLogs.SetOutboundHMACKey(h)

	savedConfig := nodeConfig.GetConfig()
	nodeAddress := savedConfig.NodeAddress
	if nodeAddress == "" {
		nodeAddress = os.Getenv("NODE_ADDRESS")
	}
	if nodeAddress == "" {
		nodeAddress = fmt.Sprintf("http://127.0.0.1:%d", port)
	}

	panelURL := savedConfig.PanelURL
	if panelURL == "" {
		panelURL = os.Getenv("PANEL_URL")
	}

	nodeLogs.InitLogPusher(nodeAddress)
	if panelURL != "" {
		nodeLogs.SetPanelURL(panelURL)
	}
	logger.SetLogPusher(nodeLogs.PushLog)

	xrayManager := xray.NewManager()
	if panelURL != "" {
		configpull.TryPullAndApply(panelURL, nodeAddress, h, xrayManager)
	}
	server := api.NewServer(port, xrayManager)
	server.SetPairing(bundle)
	log.Printf("SECRET_KEY: TLS + mTLS + JWT; log push uses HMAC (optional PANEL_URL in config or env)")

	log.Printf("Starting SharX Node Service on port %d", port)
	// Must run before Start(): Start blocks on Serve(), so code after it never runs.
	go geopush.Run(panelURL, nodeAddress, h)

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	errCh := make(chan error, 1)
	go func() {
		errCh <- server.Start()
	}()

	select {
	case err := <-errCh:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Failed to start server: %v", err)
		}
	case <-sigCh:
		log.Println("Shutting down...")
		xrayManager.Stop()
		if err := server.Stop(); err != nil {
			log.Printf("server stop: %v", err)
		}
	}

	log.Println("Shutdown complete")
}
