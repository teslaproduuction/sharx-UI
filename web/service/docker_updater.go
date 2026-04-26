package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/konstpic/sharx-code/v2/config"
)

// DockerUpdaterConfigured reports whether the panel can call an optional sidecar (e.g. Watchtower) to pull/recreate containers.
func DockerUpdaterConfigured() bool {
	return config.GetDockerUpdaterURL() != "" && config.GetDockerUpdaterToken() != ""
}

// TriggerDockerUpdater calls the configured updater HTTP endpoint (GET with Bearer token), e.g. Watchtower /v1/update.
func TriggerDockerUpdater(ctx context.Context) error {
	url := config.GetDockerUpdaterURL()
	token := config.GetDockerUpdaterToken()
	if url == "" || token == "" {
		return fmt.Errorf("docker updater is not configured (set XUI_DOCKER_UPDATER_URL and XUI_DOCKER_UPDATER_TOKEN)")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 3 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		msg := strings.TrimSpace(string(body))
		if msg == "" {
			msg = resp.Status
		}
		return fmt.Errorf("updater HTTP %d: %s", resp.StatusCode, msg)
	}
	return nil
}
