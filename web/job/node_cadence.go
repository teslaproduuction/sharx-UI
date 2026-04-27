// Package job provides scheduled background jobs for the SharX panel.
package job

// NodeJobTickSchedule is how often multi-node jobs wake up; actual cadence uses panel settings (throttling inside Run).
const NodeJobTickSchedule = "@every 1s"

// HealthPollIntervalSec returns seconds between health checks for this node status (adaptive: faster when not online).
func HealthPollIntervalSec(status string, normalSec, degradedSec int) int {
	if status == "online" {
		return normalSec
	}
	return degradedSec
}
