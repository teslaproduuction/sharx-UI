// Package configpull fetches Xray configuration from the panel on worker startup (HMAC pairing).
package configpull

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/node/xray"
	"github.com/konstpic/sharx-code/v2/util/pairing_outbound"
)

// TryPullAndApply requests the latest Xray JSON from the panel and applies it if Xray is not running.
// Requires PANEL_URL, matching nodeAddress (as registered on the panel), and the outbound HMAC key.
func TryPullAndApply(panelURL, nodeAddress string, hmacKey [32]byte, mgr *xray.Manager) {
	panelURL = strings.TrimSpace(panelURL)
	nodeAddress = strings.TrimSpace(nodeAddress)
	if panelURL == "" || nodeAddress == "" {
		return
	}
	if mgr == nil || mgr.IsRunning() {
		return
	}

	type pullBody struct {
		NodeAddress string `json:"nodeAddress"`
	}
	payload, err := json.Marshal(pullBody{NodeAddress: nodeAddress})
	if err != nil {
		logger.Warningf("Config pull: marshal request: %v", err)
		return
	}

	endpoint := strings.TrimRight(panelURL, "/") + "/panel/api/node/pull-xray-config"
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		logger.Warningf("Config pull: build request: %v", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Sharx-Signature", "v1="+pairing_outbound.SignBody(hmacKey, payload))

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		logger.Warningf("Config pull: request failed: %v", err)
		return
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		logger.Warningf("Config pull: read body: %v", err)
		return
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Warningf("Config pull: panel HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
		return
	}

	var envelope struct {
		Config json.RawMessage `json:"config"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		logger.Warningf("Config pull: invalid JSON: %v", err)
		return
	}
	if len(envelope.Config) == 0 {
		logger.Warningf("Config pull: empty config in response")
		return
	}

	if err := mgr.ApplyConfig(envelope.Config); err != nil {
		logger.Warningf("Config pull: apply config: %v", err)
		return
	}
	logger.Infof("Config pull: applied Xray configuration from panel (%d bytes)", len(envelope.Config))
}
