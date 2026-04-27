// Package job provides scheduled background jobs for the SharX panel.
package job

import (
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/web/service"
	"github.com/konstpic/sharx-code/v2/web/websocket"
)

// CheckNodeHealthJob periodically checks the health of all nodes in multi-node mode.
type CheckNodeHealthJob struct {
	nodeService service.NodeService
	runMu       sync.Mutex
}

// NewCheckNodeHealthJob creates a new job for checking node health.
func NewCheckNodeHealthJob() *CheckNodeHealthJob {
	return &CheckNodeHealthJob{
		nodeService: service.NodeService{},
	}
}

// Run executes the health check for all nodes.
func (j *CheckNodeHealthJob) Run() {
	if !j.runMu.TryLock() {
		logger.Debug("CheckNodeHealthJob: skip tick, previous run still in progress")
		return
	}
	defer j.runMu.Unlock()

	// Check if multi-node mode is enabled
	settingService := service.SettingService{}
	multiMode, err := settingService.GetMultiNodeMode()
	if err != nil || !multiMode {
		return // Skip if multi-node mode is not enabled
	}

	nodes, err := j.nodeService.GetAllNodes()
	if err != nil {
		logger.Errorf("Failed to get nodes for health check: %v", err)
		return
	}

	if len(nodes) == 0 {
		return // No nodes to check
	}

	normalSec, err := settingService.GetNodeHealthCheckIntervalSec()
	if err != nil {
		normalSec = 15
	}
	degradedSec, err := settingService.GetNodeHealthCheckDegradedIntervalSec()
	if err != nil {
		degradedSec = 5
	}

	now := time.Now().Unix()
	var wg sync.WaitGroup
	checked := 0
	for _, node := range nodes {
		if !node.Enable {
			continue
		}
		intervalSec := HealthPollIntervalSec(node.Status, normalSec, degradedSec)
		if node.LastCheck > 0 && now-node.LastCheck < int64(intervalSec) {
			continue
		}
		n := node
		checked++
		wg.Add(1)
		go func(np *model.Node) {
			defer wg.Done()
			if hErr := j.nodeService.CheckNodeHealth(np); hErr != nil {
				logger.Debugf("[Node: %s] Health check failed: %v", np.Name, hErr)
			} else {
				logger.Debugf("[Node: %s] Status: %s, ResponseTime: %d ms", np.Name, np.Status, np.ResponseTime)
			}
		}(n)
	}

	wg.Wait()
	if checked == 0 {
		return
	}
	
	// Get updated nodes with response times
	updatedNodes, err := j.nodeService.GetAllNodes()
	if err != nil {
		logger.Warningf("Failed to get nodes for WebSocket broadcast: %v", err)
		return
	}
	
	// Enrich nodes with assigned inbounds information
	type NodeWithInbounds struct {
		*model.Node
		Inbounds    []*model.Inbound                    `json:"inbounds,omitempty"`
		Profiles    []*model.XrayCoreConfigProfile       `json:"profiles,omitempty"`
		XrayVersion string                                `json:"xrayVersion,omitempty"`
	}
	
	profileService := service.XrayCoreConfigProfileService{}
	result := make([]NodeWithInbounds, 0, len(updatedNodes))
	for _, node := range updatedNodes {
		inbounds, _ := j.nodeService.GetInboundsForNode(node.Id)
		profiles, _ := profileService.GetProfilesForNode(node.Id)
		// Get Xray version from node (only if node is online)
		xrayVersion := ""
		if node.Status == "online" {
			xrayVersion = j.nodeService.GetNodeXrayVersion(node)
		}
		result = append(result, NodeWithInbounds{
			Node:        node,
			Inbounds:    inbounds,
			Profiles:    profiles,
			XrayVersion: xrayVersion,
		})
	}
	
	// Broadcast via WebSocket
	websocket.BroadcastNodes(result)
}
