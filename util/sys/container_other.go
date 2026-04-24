//go:build !linux
// +build !linux

package sys

import "fmt"

// ContainerStats represents container resource statistics
type ContainerStats struct {
	MemoryUsed  uint64
	MemoryLimit uint64
	CPUQuota    int64
	CPUPeriod   uint64
	IsContainer bool
}

// GetContainerStats is only implemented on Linux (cgroups). On other OSes, always return nil.
func GetContainerStats() *ContainerStats {
	return nil
}

// GetContainerCPUPercent is only meaningful on Linux with cgroup limits.
func GetContainerCPUPercent() (float64, error) {
	return -1, fmt.Errorf("not in container or no CPU limits")
}
