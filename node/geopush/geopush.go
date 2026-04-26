// Package geopush sends one-shot egress geolocation from the worker to the panel (HMAC, pairing).
package geopush

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/geoip"
	"github.com/konstpic/sharx-code/v2/util/pairing_outbound"
)

// Run resolves this host's public IP and approximate coordinates, logs the outcome,
// and POSTs them to the panel when panelURL is non-empty (env PANEL_URL, node-config.json, or apply-config).
func Run(panelURL, nodeAddress string, hmacKey [32]byte) {
	logger.Infof("Geography: resolving public egress IP (world map on panel)...")

	c := geoip.Client{}
	l, err := c.LookupSelf()
	if err != nil {
		logger.Warningf("Geography: lookup failed (no outbound HTTPS or geo APIs unreachable): %v", err)
		return
	}

	logger.Infof("Geography: public IP %s, approx. %.4f°, %.4f° (geocode: %s)", l.IP, l.Lat, l.Lon, l.Source)

	panelURL = strings.TrimSpace(panelURL)
	nodeAddress = strings.TrimSpace(nodeAddress)
	if panelURL == "" {
		logger.Infof("Geography: not sent to panel (set PANEL_URL or panelUrl in node config)")
		return
	}
	if nodeAddress == "" {
		logger.Warningf("Geography: not sent to panel (node address empty)")
		return
	}

	payload := map[string]interface{}{
		"nodeAddress": nodeAddress,
		"lat":         l.Lat,
		"lng":         l.Lon,
		"source":      l.Source,
		"ip":          l.IP,
	}
	jsonData, err := json.Marshal(payload)
	if err != nil {
		logger.Warningf("Geography: marshal push body: %v", err)
		return
	}

	endpoint := strings.TrimRight(panelURL, "/") + "/panel/api/node/push-geo"
	req, err := http.NewRequest("POST", endpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		logger.Warningf("Geography: build request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sharx-Signature", "v1="+pairing_outbound.SignBody(hmacKey, jsonData))

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req = req.WithContext(ctx)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		logger.Warningf("Geography: push to panel failed: %v", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Warningf("Geography: push to panel HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		return
	}
	logger.Infof("Geography: coordinates sent to panel OK")
}
