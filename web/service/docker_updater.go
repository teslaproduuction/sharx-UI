package service

import (
	"context"

	"github.com/konstpic/sharx-code/v2/util/dockerupdater"
)

// DockerUpdaterConfigured reports whether the panel can call an optional sidecar (e.g. Watchtower) to pull/recreate containers.
func DockerUpdaterConfigured() bool {
	return dockerupdater.Configured()
}

// TriggerDockerUpdater calls the configured updater HTTP endpoint (GET with Bearer token), e.g. Watchtower /v1/update.
func TriggerDockerUpdater(ctx context.Context) error {
	return dockerupdater.Trigger(ctx)
}
