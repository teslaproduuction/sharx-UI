// Package service provides Node management service for multi-node architecture.
package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/common"
	"github.com/konstpic/sharx-code/v2/xray"

	"gorm.io/gorm"
)

// NodeService provides business logic for managing nodes in multi-node mode.
type NodeService struct{}

// ErrNodeNeedsReregistration is returned when the node is online but JWT auth to the node API fails.
type ErrNodeNeedsReregistration struct {
	NodeName string
}

func (e *ErrNodeNeedsReregistration) Error() string {
	return fmt.Sprintf("node '%s' needs to be re-paired (panel cannot authenticate to the node API)", e.NodeName)
}

// GetAllNodes retrieves all nodes from the database.
func (s *NodeService) GetAllNodes() ([]*model.Node, error) {
	db := database.GetDB()
	var nodes []*model.Node
	err := db.Find(&nodes).Error
	return nodes, err
}

// GetNode retrieves a node by ID.
func (s *NodeService) GetNode(id int) (*model.Node, error) {
	db := database.GetDB()
	var node model.Node
	err := db.First(&node, id).Error
	if err != nil {
		return nil, err
	}
	return &node, nil
}

var pushAddressPortRe = regexp.MustCompile(`:(\d+)(?:/|$)`)

func extractPortForPush(address string) string {
	matches := pushAddressPortRe.FindStringSubmatch(address)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

// FindNodeByPushAddress matches a node row by the URL the worker sends in log/geo push (exact or same port).
func (s *NodeService) FindNodeByPushAddress(nodeAddress string) (*model.Node, error) {
	nodes, err := s.GetAllNodes()
	if err != nil {
		return nil, err
	}
	reqAddr := strings.TrimSuffix(strings.TrimSpace(nodeAddress), "/")
	reqPort := extractPortForPush(reqAddr)
	for _, n := range nodes {
		nodeAddr := strings.TrimSuffix(strings.TrimSpace(n.Address), "/")
		nodePort := extractPortForPush(nodeAddr)
		if nodeAddr == reqAddr || (reqPort != "" && nodePort != "" && nodePort == reqPort) {
			return n, nil
		}
	}
	return nil, nil
}

// UpdateNodeGeography updates approximate lat/lon from an IP lookup (node worker or future refresh).
func (s *NodeService) UpdateNodeGeography(id int, lat, lng float64, source string) error {
	now := time.Now().Unix()
	return database.GetDB().Model(&model.Node{}).Where("id = ?", id).Updates(map[string]interface{}{
		"geo_lat":        lat,
		"geo_lng":        lng,
		"geo_updated_at": now,
		"geo_source":     source,
	}).Error
}

// nodeRequestBaseURL is the base URL the panel uses for requests to a node.
// Pairing workers only accept HTTPS (mTLS). Legacy nodes honor use_tls: plain http when UseTLS is false.
func nodeRequestBaseURL(n *model.Node) string {
	if n == nil {
		return ""
	}
	raw := strings.TrimSpace(n.Address)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	trim := func(s string) string { return strings.TrimRight(s, "/") }

	if n.IsPairingMode() {
		if u.Scheme == "" || u.Scheme == "http" {
			if u.Scheme == "" {
				u, _ = url.Parse("https://" + raw)
			} else {
				u.Scheme = "https"
			}
		}
		return trim(u.String())
	}
	if n.UseTLS {
		if u.Scheme == "" || u.Scheme == "http" {
			if u.Scheme == "" {
				u, _ = url.Parse("https://" + raw)
			} else {
				u.Scheme = "https"
			}
		}
		return trim(u.String())
	}
	if u.Scheme == "https" {
		u.Scheme = "http"
	}
	if u.Scheme == "" {
		u, _ = url.Parse("http://" + raw)
	}
	return trim(u.String())
}

// AddNode creates a new node (pairing-only; use PrepareNodePairing before insert).
func (s *NodeService) AddNode(node *model.Node) error {
	// Validate node name length (spaces count as characters)
	if len(node.Name) > 50 {
		return common.NewError("Node name exceeds maximum length of 50 characters (spaces count as characters)")
	}

	// Trim whitespace from name
	node.Name = strings.TrimSpace(node.Name)

	db := database.GetDB()
	return db.Create(node).Error
}

func (s *NodeService) setNodeAuthHeader(node *model.Node, req *http.Request) error {
	tok, err := s.bearerTokenForNode(node)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	return nil
}

func authDebugPrefix(_ *model.Node) string {
	return "jwt"
}

// UpdateNode updates an existing node.
// Only updates fields that are provided (non-empty for strings, non-zero for integers).
func (s *NodeService) UpdateNode(node *model.Node) error {
	db := database.GetDB()

	// Get existing node to preserve fields that are not being updated
	existingNode, err := s.GetNode(node.Id)
	if err != nil {
		return fmt.Errorf("failed to get existing node: %w", err)
	}

	// Update only provided fields
	updates := make(map[string]interface{})

	if node.Name != "" {
		// Validate node name length (spaces count as characters)
		if len(node.Name) > 50 {
			return common.NewError("Node name exceeds maximum length of 50 characters (spaces count as characters)")
		}
		// Trim whitespace from name
		updates["name"] = strings.TrimSpace(node.Name)
	}

	if node.Address != "" {
		updates["address"] = node.Address
	}

	// Update TLS settings if provided
	updates["use_tls"] = node.UseTLS
	if node.CertPath != "" {
		updates["cert_path"] = node.CertPath
	}
	if node.KeyPath != "" {
		updates["key_path"] = node.KeyPath
	}
	updates["insecure_tls"] = node.InsecureTLS

	// Update traffic limit if provided (can be 0 for unlimited)
	if node.TrafficLimitGB >= 0 && node.TrafficLimitGB != existingNode.TrafficLimitGB {
		updates["traffic_limit_gb"] = node.TrafficLimitGB
	}

	// Update status, response_time, and last_check if provided (these are usually set by health checks, not user edits)
	if node.Status != "" && node.Status != existingNode.Status {
		updates["status"] = node.Status
	}

	if node.ResponseTime > 0 && node.ResponseTime != existingNode.ResponseTime {
		updates["response_time"] = node.ResponseTime
	} else if node.ResponseTime == 0 && existingNode.ResponseTime > 0 {
		// Allow resetting to 0 (e.g., on error)
		updates["response_time"] = 0
	}

	if node.LastCheck > 0 && node.LastCheck != existingNode.LastCheck {
		updates["last_check"] = node.LastCheck
	}

	// If no fields to update, return early
	if len(updates) == 0 {
		return nil
	}

	// Update only the specified fields
	return db.Model(existingNode).Updates(updates).Error
}

// DeleteNode deletes a node by ID.
// This will cascade delete all InboundNodeMapping entries for this node.
func (s *NodeService) DeleteNode(id int) error {
	db := database.GetDB()

	// Delete all node mappings for this node (cascade delete)
	err := db.Where("node_id = ?", id).Delete(&model.InboundNodeMapping{}).Error
	if err != nil {
		return err
	}

	// Delete the node itself
	if err := db.Delete(&model.Node{}, id).Error; err != nil {
		return err
	}
	resetNodeHealthTgHysteresis(id)
	return nil
}

// SetNodeEnabled sets the node's enabled flag in the database.
// Column `enable` is BOOLEAN (migration 0033); use bool — pgx cannot encode int into bool.
func (s *NodeService) SetNodeEnabled(id int, enable bool) error {
	return database.GetDB().Model(&model.Node{}).Where("id = ?", id).Update("enable", enable).Error
}

// SetNodeXrayState persists worker Xray state (running | stopped | error | unknown).
func (s *NodeService) SetNodeXrayState(id int, state string) error {
	st := strings.TrimSpace(strings.ToLower(state))
	switch st {
	case model.NodeXrayRunning, model.NodeXrayStopped, model.NodeXrayError, model.NodeXrayUnknown:
	default:
		st = model.NodeXrayUnknown
	}
	return database.GetDB().Model(&model.Node{}).Where("id = ?", id).Update("xray_state", st).Error
}

func statusMapRunning(v interface{}) bool {
	switch x := v.(type) {
	case bool:
		return x
	case float64:
		return x != 0
	default:
		return false
	}
}

// RefreshNodeXrayStateFromWorker sets xray_state from GET /api/v1/status on the worker.
func (s *NodeService) RefreshNodeXrayStateFromWorker(node *model.Node) error {
	if node == nil {
		return nil
	}
	if !node.Enable {
		return s.SetNodeXrayState(node.Id, model.NodeXrayStopped)
	}
	st, err := s.GetNodeStatus(node)
	if err != nil {
		if node.Status == "online" {
			return s.SetNodeXrayState(node.Id, model.NodeXrayError)
		}
		return s.SetNodeXrayState(node.Id, model.NodeXrayUnknown)
	}
	if statusMapRunning(st["running"]) {
		return s.SetNodeXrayState(node.Id, model.NodeXrayRunning)
	}
	return s.SetNodeXrayState(node.Id, model.NodeXrayStopped)
}

// StopXrayOnNode stops the Xray core on the worker (panel disables node).
func (s *NodeService) StopXrayOnNode(node *model.Node) error {
	if node == nil {
		return fmt.Errorf("node is nil")
	}
	client, err := s.createHTTPClient(node, 30*time.Second)
	if err != nil {
		return err
	}
	url := fmt.Sprintf("%s/api/v1/stop-xray", nodeRequestBaseURL(node))
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return err
	}
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("stop-xray: HTTP %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// CheckNodeHealth checks if a node is online and updates its status and response time.
func (s *NodeService) CheckNodeHealth(node *model.Node) error {
	if node != nil && !node.Enable {
		resetNodeHealthTgHysteresis(node.Id)
		_ = s.SetNodeXrayState(node.Id, model.NodeXrayStopped)
		return nil
	}
	// Get previous status before checking (to detect status changes)
	previousStatus := node.Status

	status, responseTime, err := s.CheckNodeStatus(node)
	if err != nil {
		node.Status = "error"
		node.ResponseTime = 0 // Set to 0 on error
		node.LastCheck = time.Now().Unix()
		if updateErr := s.UpdateNode(node); updateErr != nil {
			logger.Errorf("[Node: %s] Failed to update node status: %v", node.Name, updateErr)
		}
		_ = s.SetNodeXrayState(node.Id, model.NodeXrayError)
		sendDown, _, downFrom := nodeHealthTgHysteresisAfterCheck(node.Id, true, previousStatus)
		if sendDown {
			if downFrom == "" {
				downFrom = previousStatus
			}
			s.notifyNodeStatusChange(node, downFrom, "error")
		}
		return err
	}

	node.Status = status
	node.ResponseTime = responseTime
	node.LastCheck = time.Now().Unix()
	logger.Debugf("[Node: %s] Health check: status=%s, responseTime=%d ms", node.Name, status, responseTime)
	if updateErr := s.UpdateNode(node); updateErr != nil {
		logger.Errorf("[Node: %s] Failed to update node with response time: %v", node.Name, updateErr)
		return updateErr
	}
	_, sendUp, _ := nodeHealthTgHysteresisAfterCheck(node.Id, false, previousStatus)
	if sendUp {
		// A "down" alert was open; we require 2 OK checks before confirming recovery in Telegram.
		s.notifyNodeStatusChange(node, "error", "online")
	}
	if fresh, gErr := s.GetNode(node.Id); gErr == nil && fresh.Enable {
		_ = s.RefreshNodeXrayStateFromWorker(fresh)
	}
	return nil
}

// notifyNodeStatusChange sends a Telegram notification when a node's status changes.
func (s *NodeService) notifyNodeStatusChange(node *model.Node, oldStatus, newStatus string) {
	// Check if multi-node mode is enabled
	settingService := SettingService{}
	multiMode, err := settingService.GetMultiNodeMode()
	if err != nil || !multiMode {
		return // Skip if multi-node mode is not enabled
	}

	// Check if Telegram bot is running
	tgbotService := Tgbot{}
	if !tgbotService.IsRunning() {
		return // Skip if bot is not running
	}

	// Build notification message
	var msg string
	if newStatus == "online" {
		msg = tgbotService.I18nBot("tgbot.messages.nodeOnline")
		msg += tgbotService.I18nBot("tgbot.messages.nodeName", "Name=="+node.Name)
		msg += tgbotService.I18nBot("tgbot.messages.nodeAddress", "Address=="+node.Address)
		msg += tgbotService.I18nBot("tgbot.messages.previousStatus", "Status=="+oldStatus)
		msg += tgbotService.I18nBot("tgbot.messages.currentStatus", "Status=="+newStatus)
		msg += tgbotService.I18nBot("tgbot.messages.responseTime", "Time=="+fmt.Sprintf("%d", node.ResponseTime))
		msg += tgbotService.I18nBot("tgbot.messages.time", "Time=="+time.Now().Format("2006-01-02 15:04:05"))
	} else if newStatus == "offline" || newStatus == "error" {
		msg = tgbotService.I18nBot("tgbot.messages.nodeOffline")
		msg += tgbotService.I18nBot("tgbot.messages.nodeName", "Name=="+node.Name)
		msg += tgbotService.I18nBot("tgbot.messages.nodeAddress", "Address=="+node.Address)
		msg += tgbotService.I18nBot("tgbot.messages.previousStatus", "Status=="+oldStatus)
		msg += tgbotService.I18nBot("tgbot.messages.currentStatus", "Status=="+newStatus)
		msg += tgbotService.I18nBot("tgbot.messages.time", "Time=="+time.Now().Format("2006-01-02 15:04:05"))
	} else {
		return // Don't notify for other status changes
	}

	// Send notification to all admins
	tgbotService.SendMsgToTgbotAdmins(msg)
}

// createHTTPClient returns an HTTP client for panel→node calls.
// Pairing (and legacy with UseTLS) use mTLS; legacy with UseTLS false uses plain HTTP.
func (s *NodeService) createHTTPClient(node *model.Node, timeout time.Duration) (*http.Client, error) {
	if node != nil && !node.IsPairingMode() && !node.UseTLS {
		return &http.Client{Timeout: timeout}, nil
	}
	pairing := &PanelPairingService{}
	cfg, err := pairing.GetClientTLSConfig()
	if err != nil {
		return nil, err
	}
	transport := &http.Transport{TLSClientConfig: cfg}
	return &http.Client{Timeout: timeout, Transport: transport}, nil
}

// CheckNodeStatus performs a health check on a given node and measures response time.
// If the node answers /health but JWT to /api/v1/status fails, returns ErrNodeNeedsReregistration.
func (s *NodeService) CheckNodeStatus(node *model.Node) (string, int64, error) {
	client, err := s.createHTTPClient(node, 5*time.Second)
	if err != nil {
		return "error", 0, err
	}

	url := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))

	// Measure response time
	startTime := time.Now()
	resp, err := client.Get(url)
	responseTime := time.Since(startTime).Milliseconds()

	if err != nil {
		return "offline", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		statusURL := fmt.Sprintf("%s/api/v1/status", nodeRequestBaseURL(node))
		statusReq, err := http.NewRequest("GET", statusURL, nil)
		if err == nil {
			if err := s.setNodeAuthHeader(node, statusReq); err == nil {
				statusResp, statusErr := client.Do(statusReq)
				if statusErr == nil {
					statusResp.Body.Close()
					if statusResp.StatusCode == http.StatusUnauthorized {
						return "error", responseTime, &ErrNodeNeedsReregistration{NodeName: node.Name}
					}
				}
			}
		}
		return "online", responseTime, nil
	}
	return "error", 0, fmt.Errorf("node returned status code %d", resp.StatusCode)
}

// CheckAllNodesHealth checks health of all nodes and waits for all checks to complete.
func (s *NodeService) CheckAllNodesHealth() {
	nodes, err := s.GetAllNodes()
	if err != nil {
		logger.Errorf("Failed to get nodes for health check: %v", err)
		return
	}

	if len(nodes) == 0 {
		return
	}

	// Use WaitGroup to wait for all health checks to complete
	var wg sync.WaitGroup
	for _, node := range nodes {
		if !node.Enable {
			continue
		}
		n := node // Capture loop variable
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.CheckNodeHealth(n)
		}()
	}
	wg.Wait()
}

// GetNodeForInbound returns the node assigned to an inbound, or nil if not assigned.
// Deprecated: Use GetNodesForInbound for multi-node support.
func (s *NodeService) GetNodeForInbound(inboundId int) (*model.Node, error) {
	db := database.GetDB()
	var mapping model.InboundNodeMapping
	err := db.Where("inbound_id = ?", inboundId).First(&mapping).Error
	if err != nil {
		return nil, err // Not found is OK, means inbound is not assigned to any node
	}

	return s.GetNode(mapping.NodeId)
}

// GetNodesForInbound returns all nodes assigned to an inbound.
func (s *NodeService) GetNodesForInbound(inboundId int) ([]*model.Node, error) {
	db := database.GetDB()
	var mappings []model.InboundNodeMapping
	err := db.Where("inbound_id = ?", inboundId).Find(&mappings).Error
	if err != nil {
		return nil, err
	}

	nodes := make([]*model.Node, 0, len(mappings))
	for _, mapping := range mappings {
		node, err := s.GetNode(mapping.NodeId)
		if err == nil && node != nil {
			nodes = append(nodes, node)
		}
	}
	return nodes, nil
}

// GetInboundsForNode returns all inbounds assigned to a node.
func (s *NodeService) GetInboundsForNode(nodeId int) ([]*model.Inbound, error) {
	db := database.GetDB()
	var mappings []model.InboundNodeMapping
	err := db.Where("node_id = ?", nodeId).Find(&mappings).Error
	if err != nil {
		return nil, err
	}

	inbounds := make([]*model.Inbound, 0, len(mappings))
	for _, mapping := range mappings {
		var inbound model.Inbound
		err := db.First(&inbound, mapping.InboundId).Error
		if err == nil {
			inbounds = append(inbounds, &inbound)
		}
	}
	return inbounds, nil
}

// NodeStatsResponse represents the response from node stats API.
type NodeStatsResponse struct {
	Traffic       []*NodeTraffic       `json:"traffic"`
	ClientTraffic []*NodeClientTraffic `json:"clientTraffic"`
	OnlineClients []string             `json:"onlineClients"`
}

// NodeTraffic represents traffic statistics from a node.
type NodeTraffic struct {
	IsInbound  bool   `json:"isInbound"`
	IsOutbound bool   `json:"isOutbound"`
	Tag        string `json:"tag"`
	Up         int64  `json:"up"`
	Down       int64  `json:"down"`
}

// NodeClientTraffic represents client traffic statistics from a node.
type NodeClientTraffic struct {
	Email string `json:"email"`
	Up    int64  `json:"up"`
	Down  int64  `json:"down"`
}

// NodePublicHealth is a subset of the node worker's GET /health (no auth).
type NodePublicHealth struct {
	Status      string `json:"status"`
	Service     string `json:"service"`
	XrayRunning bool   `json:"xrayRunning"`
	XrayVersion string `json:"xrayVersion"`
	XrayUptime  int64  `json:"xrayUptime"`
}

// isExpectedNodeStatsFailure returns true for errors that are normal when Xray is not up yet.
func isExpectedNodeStatsFailure(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	if strings.Contains(s, "XRAY is not running") {
		return true
	}
	if strings.Contains(s, "XRAY_NOT_READY") {
		return true
	}
	if strings.Contains(s, "status code 404") {
		return true
	}
	if strings.Contains(s, "status code 500") {
		return true
	}
	if strings.Contains(s, "status code 503") {
		return true
	}
	if strings.Contains(s, "context deadline exceeded") ||
		strings.Contains(s, "timeout") ||
		strings.Contains(s, "Client.Timeout") {
		return true
	}
	return false
}

// GetNodePublicHealth fetches the node /health response (xrayRunning, no auth).
func (s *NodeService) GetNodePublicHealth(node *model.Node) (*NodePublicHealth, error) {
	client, err := s.createHTTPClient(node, 5*time.Second)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("node health: status %d: %s", resp.StatusCode, string(body))
	}
	// Backward compatible: if xrayRunning is absent (old node binary), do not treat as "not running"
	var outer map[string]json.RawMessage
	if err := json.Unmarshal(body, &outer); err != nil {
		return nil, err
	}
	_, hasXray := outer["xrayRunning"]
	if !hasXray {
		return &NodePublicHealth{Status: "ok", XrayRunning: true}, nil
	}
	var h NodePublicHealth
	if err := json.Unmarshal(body, &h); err != nil {
		return nil, err
	}
	return &h, nil
}

// GetNodeStats retrieves traffic and online clients statistics from a node.
func (s *NodeService) GetNodeStats(node *model.Node, reset bool) (*NodeStatsResponse, error) {
	// Calculate adaptive timeout based on node's response time history
	// For high-load nodes, use longer timeouts and more retries
	baseTimeout := 10 * time.Second // Default timeout
	maxTimeout := 30 * time.Second  // Default max timeout

	// Detect high-load nodes: response time > 5 seconds or timeout history
	isHighLoad := false
	if node.ResponseTime > 5000 { // > 5 seconds
		isHighLoad = true
		maxTimeout = 60 * time.Second // Increase max timeout to 60s for high-load nodes
	}

	if node.ResponseTime > 0 {
		// Convert response time from milliseconds to duration
		responseTime := time.Duration(node.ResponseTime) * time.Millisecond
		// Use 5x response time + 3 second buffer for high-load nodes, 3x + 2s for normal
		multiplier := 3
		buffer := 2 * time.Second
		if isHighLoad {
			multiplier = 5
			buffer = 3 * time.Second
		}
		calculatedTimeout := responseTime*time.Duration(multiplier) + buffer
		if calculatedTimeout < 5*time.Second {
			baseTimeout = 5 * time.Second
		} else if calculatedTimeout > maxTimeout {
			baseTimeout = maxTimeout
		} else {
			baseTimeout = calculatedTimeout
		}
	}

	url := fmt.Sprintf("%s/api/v1/stats", nodeRequestBaseURL(node))
	if reset {
		url += "?reset=true"
	}

	logger.Debugf("[Node: %s] Getting stats from %s (reset=%v, timeout=%v, highLoad=%v)",
		node.Name, url, reset, baseTimeout, isHighLoad)

	// Retry logic: more attempts for high-load nodes
	maxRetries := 3
	if isHighLoad {
		maxRetries = 5 // More retries for high-load nodes
	}

	var lastErr error
	for attempt := 0; attempt < maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff with longer delays for high-load nodes
			baseBackoff := 500 * time.Millisecond
			if isHighLoad {
				baseBackoff = 1 * time.Second // Start with 1s for high-load nodes
			}
			backoff := baseBackoff * time.Duration(1<<uint(attempt-1))
			// Cap backoff at 5s for normal nodes, 10s for high-load
			maxBackoff := 5 * time.Second
			if isHighLoad {
				maxBackoff = 10 * time.Second
			}
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
			logger.Debugf("[Node: %s] Retrying stats request (attempt %d/%d) after %v", node.Name, attempt+1, maxRetries, backoff)
			time.Sleep(backoff)

			// Increase timeout on retry for high-load nodes (adaptive timeout)
			if isHighLoad && attempt > 1 {
				baseTimeout = baseTimeout + 5*time.Second
				if baseTimeout > maxTimeout {
					baseTimeout = maxTimeout
				}
				logger.Debugf("[Node: %s] Increased timeout to %v for retry attempt %d", node.Name, baseTimeout, attempt+1)
			}
		}

		client, err := s.createHTTPClient(node, baseTimeout)
		if err != nil {
			lastErr = fmt.Errorf("failed to create HTTP client: %w", err)
			continue
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			lastErr = fmt.Errorf("failed to create request: %w", err)
			continue
		}

		if err := s.setNodeAuthHeader(node, req); err != nil {
			lastErr = err
			continue
		}

		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			// Check if error is retryable (timeout, network errors, transient close/reset)
			errMsg := err.Error()
			isRetryable := errors.Is(err, io.EOF) ||
				strings.Contains(errMsg, "context deadline exceeded") ||
				strings.Contains(errMsg, "timeout") ||
				strings.Contains(errMsg, "Client.Timeout") ||
				strings.Contains(errMsg, "connection refused") ||
				strings.Contains(errMsg, "no such host") ||
				strings.Contains(errMsg, "network is unreachable") ||
				strings.Contains(errMsg, "connection reset") ||
				strings.Contains(errMsg, "broken pipe") ||
				strings.Contains(errMsg, "use of closed network connection")

			if !isRetryable || attempt == maxRetries-1 {
				// Non-retryable error or last attempt
				if strings.Contains(errMsg, "context deadline exceeded") ||
					strings.Contains(errMsg, "timeout") ||
					strings.Contains(errMsg, "Client.Timeout") {
					logger.Debugf("[Node: %s] Stats request timeout after %d attempts: %v (URL: %s)", node.Name, attempt+1, err, url)
				} else {
					logger.Errorf("[Node: %s] Failed to request stats after %d attempts: %v (URL: %s)", node.Name, attempt+1, err, url)
				}
				return nil, fmt.Errorf("failed to request node stats: %w", err)
			}
			// Retryable error, continue to next attempt
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			sbody := string(body)
			// 503 with Xray not started is expected; do not burn retries
			if resp.StatusCode == 503 && (strings.Contains(sbody, "XRAY_NOT_READY") || strings.Contains(sbody, "XRAY is not running")) {
				return nil, fmt.Errorf("node returned status code 503: %s", sbody)
			}
			// Retry on 500/503 (transient) and 429 (rate limit) for high-load nodes
			if (resp.StatusCode == 500 || resp.StatusCode == 503 || (resp.StatusCode == 429 && isHighLoad)) && attempt < maxRetries-1 {
				lastErr = fmt.Errorf("node returned status code %d: %s", resp.StatusCode, sbody)
				continue
			}
			return nil, fmt.Errorf("node returned status code %d: %s", resp.StatusCode, sbody)
		}

		var stats NodeStatsResponse
		if err := json.NewDecoder(resp.Body).Decode(&stats); err != nil {
			lastErr = fmt.Errorf("failed to decode response: %w", err)
			// Don't retry on decode errors
			return nil, lastErr
		}

		// Success
		if attempt > 0 {
			logger.Debugf("[Node: %s] Stats request succeeded on attempt %d/%d", node.Name, attempt+1, maxRetries)
		}
		return &stats, nil
	}

	// All retries exhausted
	return nil, fmt.Errorf("failed to request node stats after %d attempts: %w", maxRetries, lastErr)
}

// ClientTrafficPerNodeColumn describes one node column in the client traffic matrix UI.
type ClientTrafficPerNodeColumn struct {
	Id         int    `json:"id"`
	Name       string `json:"name"`
	Status     string `json:"status"`
	Fetch      string `json:"fetch"` // ok | skipped | error
	FetchError string `json:"fetchError,omitempty"`
}

// ClientTrafficPerNodeCell is one user's traffic snapshot on one node.
type ClientTrafficPerNodeCell struct {
	Up     int64 `json:"up"`
	Down   int64 `json:"down"`
	Online bool  `json:"online"`
	OK     bool  `json:"ok"`
}

// ClientTrafficPerNodeRow is one user row aligned with nodes order.
type ClientTrafficPerNodeRow struct {
	Email  string                     `json:"email"`
	Values []ClientTrafficPerNodeCell `json:"values"`
}

// ClientTrafficPerNodeResponse is returned by GET /panel/node/client-traffic-per-node.
type ClientTrafficPerNodeResponse struct {
	MultiNode bool                         `json:"multiNode"`
	Nodes     []ClientTrafficPerNodeColumn `json:"nodes"`
	Rows      []ClientTrafficPerNodeRow    `json:"rows"`
}

// perNodeClientDelta is one client's traffic delta (Xray user stats) observed on a node during one CollectNodeStats run.
type perNodeClientDelta struct {
	NodeId int
	Email  string
	Up     int64
	Down   int64
}

// loadClientNodeTrafficForUser returns LOWER(email) -> nodeId -> up/down (bytes, Xray orientation) from DB.
func loadClientNodeTrafficForUser(userId int) (map[string]map[int]struct{ Up, Down int64 }, error) {
	db := database.GetDB()
	type trRow struct {
		Email  string
		NodeId int
		Up     int64
		Down   int64
	}
	var trRows []trRow
	err := db.Table("client_node_traffics AS cnt").
		Select("LOWER(TRIM(ce.email)) AS email, cnt.node_id, cnt.up, cnt.down").
		Joins("INNER JOIN client_entities AS ce ON ce.id = cnt.client_id").
		Where("ce.user_id = ?", userId).
		Scan(&trRows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]map[int]struct{ Up, Down int64 })
	for _, r := range trRows {
		em := strings.ToLower(strings.TrimSpace(r.Email))
		if out[em] == nil {
			out[em] = make(map[int]struct{ Up, Down int64 })
		}
		out[em][r.NodeId] = struct{ Up, Down int64 }{Up: r.Up, Down: r.Down}
	}
	return out, nil
}

func resolveClientIdOnNode(db *gorm.DB, nodeId int, email string) (int, error) {
	var id int
	q := `
SELECT ce.id
FROM client_entities AS ce
INNER JOIN client_inbound_mappings AS cim ON cim.client_id = ce.id
INNER JOIN inbound_node_mappings AS inm ON inm.inbound_id = cim.inbound_id AND inm.node_id = ?
WHERE LOWER(TRIM(ce.email)) = LOWER(TRIM(?))
LIMIT 1`
	if err := db.Raw(q, nodeId, email).Scan(&id).Error; err != nil {
		return 0, err
	}
	if id <= 0 {
		return 0, nil
	}
	return id, nil
}

// applyClientNodeTrafficDeltas accumulates per-node client stats (multi-node) in the same transaction as AddClientTraffic.
func applyClientNodeTrafficDeltas(tx *gorm.DB, deltas []perNodeClientDelta) error {
	if len(deltas) == 0 {
		return nil
	}
	now := time.Now().Unix()
	for _, d := range deltas {
		if d.Up == 0 && d.Down == 0 {
			continue
		}
		clientId, err := resolveClientIdOnNode(tx, d.NodeId, d.Email)
		if err != nil || clientId == 0 {
			continue
		}
		var row model.ClientNodeTraffic
		err = tx.Where("client_id = ? AND node_id = ?", clientId, d.NodeId).First(&row).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			row = model.ClientNodeTraffic{
				ClientId: clientId, NodeId: d.NodeId, Up: d.Up, Down: d.Down, UpdatedAt: now,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
			continue
		}
		row.Up += d.Up
		row.Down += d.Down
		row.UpdatedAt = now
		if err := tx.Save(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

const localTrafficColumnName = "Local"

// GetClientTrafficPerNodeMatrix returns per-user traffic per node (live worker /stats, reset=false) or a single Local column in single-node mode.
func (s *NodeService) GetClientTrafficPerNodeMatrix(userId int) (*ClientTrafficPerNodeResponse, error) {
	clientSvc := &ClientService{}
	clients, err := clientSvc.GetClients(userId)
	if err != nil {
		return nil, err
	}

	settingSvc := SettingService{}
	multi, err := settingSvc.GetMultiNodeMode()
	if err != nil {
		return nil, err
	}

	onlineGlobal := make(map[string]bool)
	for _, e := range getPanelOnlineClients() {
		if e != "" {
			onlineGlobal[strings.ToLower(e)] = true
		}
	}

	if !multi {
		out := &ClientTrafficPerNodeResponse{
			MultiNode: false,
			Nodes: []ClientTrafficPerNodeColumn{{
				Id:     0,
				Name:   localTrafficColumnName,
				Status: "ok",
				Fetch:  "ok",
			}},
			Rows: make([]ClientTrafficPerNodeRow, 0, len(clients)),
		}
		for _, c := range clients {
			if c == nil {
				continue
			}
			out.Rows = append(out.Rows, ClientTrafficPerNodeRow{
				Email: c.Email,
				Values: []ClientTrafficPerNodeCell{{
					Up:     c.Up,
					Down:   c.Down,
					Online: onlineGlobal[strings.ToLower(c.Email)],
					OK:     true,
				}},
			})
		}
		totals := make(map[string]int64, len(clients))
		for _, cl := range clients {
			if cl != nil {
				totals[strings.ToLower(cl.Email)] = cl.Up + cl.Down
			}
		}
		sort.Slice(out.Rows, func(i, j int) bool {
			return totals[strings.ToLower(out.Rows[i].Email)] > totals[strings.ToLower(out.Rows[j].Email)]
		})
		return out, nil
	}

	nodes, err := s.GetAllNodes()
	if err != nil {
		return nil, err
	}
	nodesWithInbounds := make([]*model.Node, 0)
	for _, node := range nodes {
		if node == nil || !node.Enable {
			continue
		}
		inbounds, e2 := s.GetInboundsForNode(node.Id)
		if e2 == nil && len(inbounds) > 0 {
			nodesWithInbounds = append(nodesWithInbounds, node)
		}
	}
	sort.Slice(nodesWithInbounds, func(i, j int) bool { return nodesWithInbounds[i].Id < nodesWithInbounds[j].Id })

	if len(nodesWithInbounds) == 0 {
		return &ClientTrafficPerNodeResponse{MultiNode: true, Nodes: nil, Rows: nil}, nil
	}

	dbTraffic, dbErr := loadClientNodeTrafficForUser(userId)
	if dbErr != nil {
		logger.Warningf("GetClientTrafficPerNodeMatrix: loadClientNodeTrafficForUser: %v", dbErr)
	}

	type fetchResult struct {
		node  *model.Node
		stats *NodeStatsResponse
		err   error
		skip  bool
	}
	ch := make(chan fetchResult, len(nodesWithInbounds))
	for _, n := range nodesWithInbounds {
		node := n
		go func() {
			if h, hErr := s.GetNodePublicHealth(node); hErr == nil && !h.XrayRunning {
				ch <- fetchResult{node: node, skip: true}
				return
			}
			stats, err := s.GetNodeStats(node, false)
			ch <- fetchResult{node: node, stats: stats, err: err}
		}()
	}

	// per node: email -> up/down; email -> online
	type nodeAgg struct {
		traffic map[string]*struct{ up, down int64 }
		online  map[string]bool
		fetch   string
		errMsg  string
	}
	aggs := make(map[int]*nodeAgg, len(nodesWithInbounds))

	for i := 0; i < len(nodesWithInbounds); i++ {
		fr := <-ch
		na := &nodeAgg{
			traffic: make(map[string]*struct{ up, down int64 }),
			online:  make(map[string]bool),
		}
		if fr.skip {
			na.fetch = "skipped"
			aggs[fr.node.Id] = na
			continue
		}
		if fr.err != nil {
			na.fetch = "error"
			na.errMsg = fr.err.Error()
			if isExpectedNodeStatsFailure(fr.err) {
				na.errMsg = ""
			}
			aggs[fr.node.Id] = na
			continue
		}
		if fr.stats == nil {
			na.fetch = "error"
			aggs[fr.node.Id] = na
			continue
		}
		na.fetch = "ok"
		for _, nct := range fr.stats.ClientTraffic {
			el := strings.ToLower(nct.Email)
			if na.traffic[el] == nil {
				na.traffic[el] = new(struct{ up, down int64 })
			}
			na.traffic[el].up += nct.Up
			na.traffic[el].down += nct.Down
		}
		for _, em := range fr.stats.OnlineClients {
			if em != "" {
				na.online[strings.ToLower(em)] = true
			}
		}
		aggs[fr.node.Id] = na
	}

	cols := make([]ClientTrafficPerNodeColumn, 0, len(nodesWithInbounds))
	for _, n := range nodesWithInbounds {
		a := aggs[n.Id]
		fetch := "error"
		errMsg := ""
		if a != nil {
			fetch = a.fetch
			if fetch == "error" && a.errMsg != "" {
				errMsg = a.errMsg
			}
		}
		cols = append(cols, ClientTrafficPerNodeColumn{
			Id:         n.Id,
			Name:       n.Name,
			Status:     n.Status,
			Fetch:      fetch,
			FetchError: errMsg,
		})
	}

	rows := make([]ClientTrafficPerNodeRow, 0, len(clients))
	for _, c := range clients {
		if c == nil {
			continue
		}
		el := strings.ToLower(c.Email)
		vals := make([]ClientTrafficPerNodeCell, len(nodesWithInbounds))
		for i, n := range nodesWithInbounds {
			a := aggs[n.Id]
			if a == nil || a.fetch != "ok" {
				vals[i] = ClientTrafficPerNodeCell{OK: false}
				continue
			}
			var up, down int64
			if dbTraffic != nil {
				if byNode, ok := dbTraffic[el]; ok {
					if v, ok := byNode[n.Id]; ok {
						up, down = v.Up, v.Down
					}
				}
			} else if t := a.traffic[el]; t != nil {
				up, down = t.up, t.down
			}
			vals[i] = ClientTrafficPerNodeCell{
				Up:     up,
				Down:   down,
				Online: a.online[el],
				OK:     true,
			}
		}
		rows = append(rows, ClientTrafficPerNodeRow{Email: c.Email, Values: vals})
	}

	nodeTrafficSum := func(email string) int64 {
		el := strings.ToLower(email)
		if dbTraffic != nil {
			var t int64
			if byNode, ok := dbTraffic[el]; ok {
				for _, v := range byNode {
					t += v.Up + v.Down
				}
			}
			return t
		}
		var t int64
		for _, n := range nodesWithInbounds {
			a := aggs[n.Id]
			if a == nil || a.fetch != "ok" {
				continue
			}
			if x := a.traffic[el]; x != nil {
				t += x.up + x.down
			}
		}
		return t
	}
	sort.Slice(rows, func(i, j int) bool {
		return nodeTrafficSum(rows[i].Email) > nodeTrafficSum(rows[j].Email)
	})

	return &ClientTrafficPerNodeResponse{
		MultiNode: true,
		Nodes:     cols,
		Rows:      rows,
	}, nil
}

// UserOnlineSessionsFromNode is the worker response for GET /api/v1/user-online-sessions.
type UserOnlineSessionsFromNode struct {
	Email         string                 `json:"email"`
	Sessions      []xray.OnlineIPSession `json:"sessions"`
	DropAvailable bool                   `json:"dropAvailable"`
}

// GetUserOnlineSessionsFromNode fetches per-IP online sessions from a worker node.
func (s *NodeService) GetUserOnlineSessionsFromNode(node *model.Node, email string, reset bool) (*UserOnlineSessionsFromNode, error) {
	base := nodeRequestBaseURL(node)
	q := url.Values{}
	q.Set("email", email)
	if reset {
		q.Set("reset", "true")
	}
	u := fmt.Sprintf("%s/api/v1/user-online-sessions?%s", base, q.Encode())

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := s.createHTTPClient(node, 30*time.Second)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("node returned %d: %s", resp.StatusCode, string(body))
	}
	var out UserOnlineSessionsFromNode
	if err := json.Unmarshal(body, &out); err != nil {
		return nil, fmt.Errorf("decode user-online-sessions: %w", err)
	}
	return &out, nil
}

// PostDropConnectionsToNode calls POST /api/v1/drop-connections on a worker.
func (s *NodeService) PostDropConnectionsToNode(node *model.Node, emails []string) error {
	if len(emails) == 0 {
		return nil
	}
	u := fmt.Sprintf("%s/api/v1/drop-connections", nodeRequestBaseURL(node))
	payload, _ := json.Marshal(map[string][]string{"emails": emails})

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	client, err := s.createHTTPClient(node, 60*time.Second)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("node returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

// PostDropIPsToNode calls POST /api/v1/drop-ips on a worker.
func (s *NodeService) PostDropIPsToNode(node *model.Node, ips []string) error {
	if len(ips) == 0 {
		return nil
	}
	u := fmt.Sprintf("%s/api/v1/drop-ips", nodeRequestBaseURL(node))
	payload, _ := json.Marshal(map[string][]string{"ips": ips})
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	client, err := s.createHTTPClient(node, 60*time.Second)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("node returned %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

// UpdateNodeTraffic updates traffic statistics for a node and checks traffic limit.
// Returns true if traffic limit is exceeded.
func (s *NodeService) UpdateNodeTraffic(nodeId int, up int64, down int64) (bool, error) {
	db := database.GetDB()

	var node model.Node
	if err := db.First(&node, nodeId).Error; err != nil {
		return false, fmt.Errorf("failed to get node: %w", err)
	}

	// Update traffic
	newUp := node.Up + up
	newDown := node.Down + down
	newAllTime := node.AllTime + up + down

	// Check traffic limit (if TrafficLimitGB > 0)
	trafficExceeded := false
	if node.TrafficLimitGB > 0 {
		trafficLimitBytes := int64(node.TrafficLimitGB * 1024 * 1024 * 1024)
		currentTotal := newUp + newDown
		if currentTotal >= trafficLimitBytes {
			trafficExceeded = true
			logger.Warningf("[Node: %s] Traffic limit exceeded: %d >= %d bytes (%.2f GB >= %.2f GB)",
				node.Name, currentTotal, trafficLimitBytes,
				float64(currentTotal)/(1024*1024*1024), node.TrafficLimitGB)
		}
	}

	// Update node traffic in database
	err := db.Model(&node).Updates(map[string]interface{}{
		"up":       newUp,
		"down":     newDown,
		"all_time": newAllTime,
	}).Error

	if err != nil {
		return false, fmt.Errorf("failed to update node traffic: %w", err)
	}

	return trafficExceeded, nil
}

// ResetNodeTraffic resets traffic statistics for a node.
func (s *NodeService) ResetNodeTraffic(nodeId int) error {
	db := database.GetDB()

	err := db.Model(&model.Node{}).Where("id = ?", nodeId).
		Updates(map[string]interface{}{
			"up":       0,
			"down":     0,
			"all_time": 0,
		}).Error

	if err != nil {
		return fmt.Errorf("failed to reset node traffic: %w", err)
	}

	return nil
}

// CollectNodeStats collects statistics from all nodes and aggregates them into the database.
// This should be called periodically (e.g., via cron job).
// New logic: collects traffic from nodes, calculates node traffic (sum of all inbounds on node),
// and client traffic (sum from all nodes through all inbounds).
func (s *NodeService) CollectNodeStats() error {
	// Check if multi-node mode is enabled
	settingService := SettingService{}
	multiMode, err := settingService.GetMultiNodeMode()
	if err != nil || !multiMode {
		return nil // Skip if multi-node mode is not enabled
	}

	nodes, err := s.GetAllNodes()
	if err != nil {
		return fmt.Errorf("failed to get nodes: %w", err)
	}

	if len(nodes) == 0 {
		return nil // No nodes to collect stats from
	}

	// Filter nodes: only collect stats from nodes that have assigned inbounds
	nodesWithInbounds := make([]*model.Node, 0)
	for _, node := range nodes {
		if !node.Enable {
			continue
		}
		inbounds, err := s.GetInboundsForNode(node.Id)
		if err == nil && len(inbounds) > 0 {
			// Only include nodes that have at least one assigned inbound
			nodesWithInbounds = append(nodesWithInbounds, node)
		}
	}

	if len(nodesWithInbounds) == 0 {
		return nil // No nodes with assigned inbounds
	}

	// Get all inbounds to build tag->inboundId map
	db := database.GetDB()
	var allInbounds []*model.Inbound
	if err := db.Model(model.Inbound{}).Select("id, tag").Find(&allInbounds).Error; err != nil {
		return fmt.Errorf("failed to get inbounds: %w", err)
	}

	// Build tag -> inboundId map
	tagToInboundId := make(map[string]int)
	for _, inbound := range allInbounds {
		tagToInboundId[inbound.Tag] = inbound.Id
	}

	// Import services
	inboundService := &InboundService{}
	clientService := &ClientService{}

	// Collect stats from nodes with assigned inbounds concurrently
	// Each node is processed independently - failures are isolated
	type nodeStatsResult struct {
		node  *model.Node
		stats *NodeStatsResponse
		err   error
		skip  bool // set when /health reports xray not running (avoids /stats 503)
	}

	results := make(chan nodeStatsResult, len(nodesWithInbounds))
	for _, node := range nodesWithInbounds {
		go func(n *model.Node) {
			if h, hErr := s.GetNodePublicHealth(n); hErr == nil && !h.XrayRunning {
				logger.Debugf("[Node: %s] Skipping stats: xray not running (GET /health)", n.Name)
				results <- nodeStatsResult{node: n, skip: true}
				return
			}
			// Use reset=true to get delta traffic (incremental values) instead of cumulative
			// This prevents double-counting when adding to database
			stats, err := s.GetNodeStats(n, true) // Reset counters to get delta
			results <- nodeStatsResult{node: n, stats: stats, err: err}
		}(node)
	}

	// Process results: calculate node traffic and client traffic
	nodeTrafficMap := make(map[int]struct {
		Up   int64
		Down int64
	}) // nodeId -> traffic

	// Map to collect client traffic by email (aggregated across all nodes)
	// email -> traffic
	clientTrafficMap := make(map[string]*xray.ClientTraffic)

	onlineClientsMap := make(map[string]bool)

	// Track success/failure counts for better logging
	successCount := 0
	failureCount := 0
	perNodeDeltas := make([]perNodeClientDelta, 0, 256)

	for i := 0; i < len(nodesWithInbounds); i++ {
		result := <-results
		if result.skip {
			continue
		}
		if result.err != nil {
			failureCount++
			// Check if error is expected (XRAY not running, 404 for old nodes, timeout, 503, etc.)
			if isExpectedNodeStatsFailure(result.err) {
				logger.Debugf("[Node: %s] Skipping stats collection (expected error): %v", result.node.Name, result.err)
			} else {
				logger.Warningf("[Node: %s] Failed to get stats (unexpected error): %v", result.node.Name, result.err)
			}
			// Continue processing other nodes - error isolation
			continue
		}

		if result.stats == nil {
			failureCount++
			logger.Debugf("[Node: %s] Stats collection returned nil", result.node.Name)
			continue
		}

		successCount++

		if result.stats == nil {
			continue
		}

		// Get inbounds assigned to this node
		nodeInbounds, err := s.GetInboundsForNode(result.node.Id)
		if err != nil {
			logger.Warningf("[Node: %s] Failed to get inbounds: %v", result.node.Name, err)
			continue
		}

		// Build set of inbound IDs for this node
		nodeInboundIds := make(map[int]bool)
		for _, inbound := range nodeInbounds {
			nodeInboundIds[inbound.Id] = true
		}

		// Calculate node traffic: sum of all inbound traffic on this node
		var nodeUp int64
		var nodeDown int64

		// Process traffic by tag (inbound traffic)
		for _, nt := range result.stats.Traffic {
			if !nt.IsInbound {
				continue // Skip outbound traffic
			}

			// Map tag to inboundId
			inboundId, ok := tagToInboundId[nt.Tag]
			if !ok {
				logger.Debugf("[Node: %s] Unknown tag in traffic: %s", result.node.Name, nt.Tag)
				continue
			}

			// Check if this inbound is assigned to this node
			if !nodeInboundIds[inboundId] {
				logger.Debugf("[Node: %s] Tag %s (inboundId %d) not assigned to this node, skipping",
					result.node.Name, nt.Tag, inboundId)
				continue
			}

			// Add to node traffic
			nodeUp += nt.Up
			nodeDown += nt.Down
		}

		// Update node traffic
		if nodeUp > 0 || nodeDown > 0 {
			nodeTraffic := nodeTrafficMap[result.node.Id]
			nodeTraffic.Up += nodeUp
			nodeTraffic.Down += nodeDown
			nodeTrafficMap[result.node.Id] = nodeTraffic
		}

		// Process client traffic: aggregate by email across all nodes
		// API returns client traffic by email (sum of all inbounds on this node for that client)
		for _, nct := range result.stats.ClientTraffic {
			email := strings.ToLower(nct.Email)

			// Initialize or update client traffic map
			if clientTrafficMap[email] == nil {
				clientTrafficMap[email] = &xray.ClientTraffic{
					Email: nct.Email,
					Up:    0,
					Down:  0,
				}
			}

			// Sum traffic from this node (values are in bytes from Xray API)
			// Log if traffic seems unusually small (might indicate unit conversion issue)
			if nct.Up > 0 || nct.Down > 0 {
				logger.Debugf("[Node: %s] Client %s traffic: Up=%d bytes, Down=%d bytes",
					result.node.Name, email, nct.Up, nct.Down)
			}
			clientTrafficMap[email].Up += nct.Up
			clientTrafficMap[email].Down += nct.Down

			if nct.Up > 0 || nct.Down > 0 {
				perNodeDeltas = append(perNodeDeltas, perNodeClientDelta{
					NodeId: result.node.Id,
					Email:  nct.Email,
					Up:     nct.Up,
					Down:   nct.Down,
				})
			}
		}

		// Collect online clients
		for _, email := range result.stats.OnlineClients {
			onlineClientsMap[email] = true
		}
	}

	// Update node traffic in database
	for nodeId, traffic := range nodeTrafficMap {
		trafficExceeded, err := s.UpdateNodeTraffic(nodeId, traffic.Up, traffic.Down)
		if err != nil {
			logger.Warningf("Failed to update traffic for node %d: %v", nodeId, err)
		} else if trafficExceeded {
			logger.Warningf("Node %d traffic limit exceeded", nodeId)
			// TODO: Handle traffic limit exceeded (disable node or inbounds)
		}
	}

	// Convert client traffic map to slice
	allClientTraffics := make([]*xray.ClientTraffic, 0, len(clientTrafficMap))
	currentTime := time.Now().UnixMilli()
	for _, traffic := range clientTrafficMap {
		allClientTraffics = append(allClientTraffics, traffic)
	}

	// Also add online clients that don't have traffic yet (to update lastOnline)
	// This ensures that clients who just came online get their lastOnline updated
	for email := range onlineClientsMap {
		// Check if this client already has traffic data
		found := false
		for _, traffic := range allClientTraffics {
			if strings.ToLower(traffic.Email) == email {
				found = true
				break
			}
		}
		// If client is online but has no traffic data, add empty traffic entry to update lastOnline
		if !found {
			allClientTraffics = append(allClientTraffics, &xray.ClientTraffic{
				Email:      email,
				Up:         0,
				Down:       0,
				LastOnline: currentTime, // Update lastOnline for online clients
			})
		} else {
			// Update lastOnline for clients with traffic
			for _, traffic := range allClientTraffics {
				if strings.ToLower(traffic.Email) == email {
					traffic.LastOnline = currentTime
					break
				}
			}
		}
	}

	// Update client traffic in database
	if len(allClientTraffics) > 0 {
		db := database.GetDB()
		tx := db.Begin()
		defer func() {
			if r := recover(); r != nil {
				tx.Rollback()
			}
		}()

		if err := applyClientNodeTrafficDeltas(tx, perNodeDeltas); err != nil {
			tx.Rollback()
			logger.Warningf("Failed to apply per-node client traffic: %v", err)
		} else {
			clientsToDisable, _, err := clientService.AddClientTraffic(tx, allClientTraffics, inboundService)
			if err != nil {
				tx.Rollback()
				logger.Warningf("Failed to add client traffic: %v", err)
			} else {
				if err := tx.Commit().Error; err != nil {
					logger.Warningf("Failed to commit client traffic: %v", err)
				} else {
					// Handle clients that need to be disabled - remove them from Xray API (both local and nodes)
					if len(clientsToDisable) > 0 {
						logger.Infof("Traffic limit exceeded for %d clients, removing from Xray via API", len(clientsToDisable))
						// Remove expired clients from Xray API asynchronously (don't block traffic processing)
						go func() {
							_, err := clientService.DisableClientsByEmail(clientsToDisable, inboundService)
							if err != nil {
								logger.Warningf("Failed to disable expired clients via API: %v", err)
							}
						}()
					}
				}
			}
		}
	}

	// Update online clients in process for GetOnlineClients() to work in multi-node mode
	// Convert onlineClientsMap to slice
	onlineClientsList := make([]string, 0, len(onlineClientsMap))
	for email := range onlineClientsMap {
		onlineClientsList = append(onlineClientsList, email)
	}

	// Same as AddClientTraffic: must work when p==nil (multi-node — no local Xray process).
	setPanelOnlineClients(onlineClientsList)

	// Log summary with success/failure counts for better visibility
	totalNodes := len(nodesWithInbounds)
	if failureCount > 0 {
		logger.Warningf("Node stats collection completed: %d/%d nodes succeeded, %d failed. Updated %d node traffics, %d client traffics, %d online clients",
			successCount, totalNodes, failureCount, len(nodeTrafficMap), len(allClientTraffics), len(onlineClientsMap))
	} else {
		logger.Debugf("Collected stats from nodes: %d/%d nodes succeeded. Updated %d node traffics, %d client traffics, %d online clients",
			successCount, totalNodes, len(nodeTrafficMap), len(allClientTraffics), len(onlineClientsMap))
	}

	return nil
}

// AssignInboundToNode assigns an inbound to a node.
func (s *NodeService) AssignInboundToNode(inboundId, nodeId int) error {
	db := database.GetDB()
	mapping := &model.InboundNodeMapping{
		InboundId: inboundId,
		NodeId:    nodeId,
	}
	return db.Save(mapping).Error
}

// AssignInboundToNodes assigns an inbound to multiple nodes.
func (s *NodeService) AssignInboundToNodes(inboundId int, nodeIds []int) error {
	db := database.GetDB()

	// Get the inbound to check its port
	var inbound model.Inbound
	if err := db.Where("id = ?", inboundId).First(&inbound).Error; err != nil {
		return fmt.Errorf("failed to get inbound %d: %w", inboundId, err)
	}

	// Check for port conflicts: one node cannot be assigned to two inbounds with the same port
	for _, nodeId := range nodeIds {
		if nodeId > 0 {
			// Get all inbounds currently assigned to this node
			existingInbounds, err := s.GetInboundsForNode(nodeId)
			if err != nil {
				return fmt.Errorf("failed to get inbounds for node %d: %w", nodeId, err)
			}

			// Check if any existing inbound has the same port (excluding the current inbound)
			for _, existingInbound := range existingInbounds {
				if existingInbound.Id != inboundId && existingInbound.Port == inbound.Port {
					return fmt.Errorf("node %d is already assigned to inbound %d with port %d. One node cannot be assigned to two inbounds with the same port", nodeId, existingInbound.Id, inbound.Port)
				}
			}
		}
	}

	// First, remove all existing assignments
	if err := db.Where("inbound_id = ?", inboundId).Delete(&model.InboundNodeMapping{}).Error; err != nil {
		return err
	}

	// Then, create new assignments
	for _, nodeId := range nodeIds {
		if nodeId > 0 {
			mapping := &model.InboundNodeMapping{
				InboundId: inboundId,
				NodeId:    nodeId,
			}
			if err := db.Create(mapping).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// UnassignInboundFromNode removes the assignment of an inbound from its node.
func (s *NodeService) UnassignInboundFromNode(inboundId int) error {
	db := database.GetDB()
	return db.Where("inbound_id = ?", inboundId).Delete(&model.InboundNodeMapping{}).Error
}

// GetNodesForOutbound retrieves all nodes assigned to a specific outbound.
func (s *NodeService) GetNodesForOutbound(outboundId int) ([]*model.Node, error) {
	db := database.GetDB()
	var nodes []*model.Node

	err := db.Model(model.Node{}).
		Joins("INNER JOIN outbound_node_mappings ON nodes.id = outbound_node_mappings.node_id").
		Where("outbound_node_mappings.outbound_id = ?", outboundId).
		Find(&nodes).Error

	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, err
	}

	return nodes, nil
}

// AssignOutboundToNode assigns an outbound to a node.
func (s *NodeService) AssignOutboundToNode(outboundId, nodeId int) error {
	db := database.GetDB()
	mapping := &model.OutboundNodeMapping{
		OutboundId: outboundId,
		NodeId:     nodeId,
	}
	return db.Save(mapping).Error
}

// AssignOutboundToNodes assigns an outbound to multiple nodes.
// Validates that nodes are not already assigned to other outbounds.
func (s *NodeService) AssignOutboundToNodes(outboundId int, nodeIds []int) error {
	if len(nodeIds) == 0 {
		// Remove all assignments if no nodes provided
		db := database.GetDB()
		return db.Where("outbound_id = ?", outboundId).Delete(&model.OutboundNodeMapping{}).Error
	}

	// Check if any nodes are already assigned to other outbounds
	outboundService := OutboundService{}
	conflictingNodes, err := outboundService.checkNodeAssignedToOtherOutbound(nodeIds, outboundId)
	if err != nil {
		return fmt.Errorf("failed to check node assignments: %w", err)
	}

	if len(conflictingNodes) > 0 {
		// Get node names for error message
		db := database.GetDB()
		var nodes []model.Node
		db.Where("id IN ?", conflictingNodes).Find(&nodes)
		nodeNames := make([]string, len(nodes))
		for i, node := range nodes {
			nodeNames[i] = node.Name
		}
		return fmt.Errorf("nodes already assigned to other outbound: %v", nodeNames)
	}

	db := database.GetDB()
	// First, remove all existing assignments
	if err := db.Where("outbound_id = ?", outboundId).Delete(&model.OutboundNodeMapping{}).Error; err != nil {
		return err
	}

	// Then, create new assignments
	for _, nodeId := range nodeIds {
		if nodeId > 0 {
			mapping := &model.OutboundNodeMapping{
				OutboundId: outboundId,
				NodeId:     nodeId,
			}
			if err := db.Create(mapping).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

// UnassignOutboundFromNode removes the assignment of an outbound from its node.
func (s *NodeService) UnassignOutboundFromNode(outboundId int) error {
	db := database.GetDB()
	return db.Where("outbound_id = ?", outboundId).Delete(&model.OutboundNodeMapping{}).Error
}

// ApplyConfigToNode sends XRAY configuration to a node.
func (s *NodeService) ApplyConfigToNode(node *model.Node, xrayConfig []byte) error {
	// Use reasonable timeout for apply-config (30 seconds should be enough for most cases)
	// If config is very large or node is slow, this can be increased
	client, err := s.createHTTPClient(node, 30*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	panelURL := s.getPanelURL()

	requestBody := map[string]interface{}{
		"config": json.RawMessage(xrayConfig),
	}
	if panelURL != "" {
		requestBody["panelUrl"] = panelURL
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/apply-config", nodeRequestBaseURL(node))
	logger.Infof("[Node: %s] Sending config to %s (config size: %d bytes, panelURL: %s)", node.Name, url, len(xrayConfig), panelURL)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}
	logger.Debugf("[Node: %s] Request headers: Content-Type=%s, Authorization=Bearer %s...", node.Name, req.Header.Get("Content-Type"), authDebugPrefix(node))

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		_ = s.SetNodeXrayState(node.Id, model.NodeXrayError)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var meta struct {
		AppliedAt    int64  `json:"appliedAt"`
		ConfigSha256 string `json:"configSha256"`
		XrayVersion  string `json:"xrayVersion"`
		XrayRunning  bool   `json:"xrayRunning"`
		Message      string `json:"message"`
	}
	parseOK := json.Unmarshal(respBody, &meta) == nil
	if parseOK && (meta.AppliedAt != 0 || meta.ConfigSha256 != "") {
		logger.Infof("[Node: %s] apply-config ok: appliedAt=%d configSha256=%s xrayVersion=%q xrayRunning=%v",
			node.Name, meta.AppliedAt, meta.ConfigSha256, meta.XrayVersion, meta.XrayRunning)
	}
	if parseOK {
		if meta.XrayRunning {
			_ = s.SetNodeXrayState(node.Id, model.NodeXrayRunning)
		} else {
			_ = s.SetNodeXrayState(node.Id, model.NodeXrayStopped)
		}
	} else {
		_ = s.RefreshNodeXrayStateFromWorker(node)
	}

	return nil
}

// ApplySessionIPBlockRoutingToNode updates one session-IP routing rule on a worker via RoutingService (no full apply-config).
func (s *NodeService) ApplySessionIPBlockRoutingToNode(node *model.Node, blocked bool, ruleTag, email, cidr string) error {
	client, err := s.createHTTPClient(node, 15*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}
	body := map[string]interface{}{
		"blocked": blocked,
		"ruleTag": ruleTag,
		"email":   email,
		"cidr":    cidr,
	}
	requestJSON, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}
	url := fmt.Sprintf("%s/api/v1/session-ip-block-routing", nodeRequestBaseURL(node))
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

// AddUserToNode adds a user to an inbound on a node via Xray API (instant, no restart).
func (s *NodeService) AddUserToNode(node *model.Node, protocol, inboundTag string, user map[string]interface{}) error {
	client, err := s.createHTTPClient(node, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	requestBody := map[string]interface{}{
		"protocol":   protocol,
		"inboundTag": inboundTag,
		"user":       user,
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/add-user", nodeRequestBaseURL(node))
	logger.Debugf("[Node: %s] Adding user via API: %s in inbound %s", node.Name, user["email"], inboundTag)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		bodyStr := string(body)
		// Check if user already exists (this is OK - user is already in Xray)
		if strings.Contains(bodyStr, "already exists") {
			logger.Infof("[Node: %s] User %s already exists in inbound %s - this is OK", node.Name, user["email"], inboundTag)
			return nil // Already exists is OK
		}
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, bodyStr)
	}

	logger.Infof("[Node: %s] User added successfully via API: %s in inbound %s", node.Name, user["email"], inboundTag)
	return nil
}

// RemoveUserFromNode removes a user from an inbound on a node via Xray API (instant, no restart).
func (s *NodeService) RemoveUserFromNode(node *model.Node, inboundTag, email string) error {
	client, err := s.createHTTPClient(node, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	requestBody := map[string]interface{}{
		"inboundTag": inboundTag,
		"email":      email,
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/remove-user", nodeRequestBaseURL(node))
	logger.Debugf("[Node: %s] Removing user via API: %s from inbound %s", node.Name, email, inboundTag)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		// Check if user not found (this is OK - might already be removed)
		if strings.Contains(string(body), "not found") || strings.Contains(string(body), "already removed") {
			logger.Debugf("[Node: %s] User %s already removed or not found in inbound %s", node.Name, email, inboundTag)
			return nil
		}
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	logger.Infof("[Node: %s] User removed successfully via API: %s from inbound %s", node.Name, email, inboundTag)
	return nil
}

// UpdateInboundOnNode updates an inbound configuration on a node via Xray API (instant, no restart).
// This is faster than full config reload - it uses DelInbound + AddInbound.
func (s *NodeService) UpdateInboundOnNode(node *model.Node, inboundConfig []byte) error {
	client, err := s.createHTTPClient(node, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	requestBody := map[string]interface{}{
		"inboundConfig": json.RawMessage(inboundConfig),
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	// Parse inbound config to get tag for logging
	var inboundJSON map[string]interface{}
	tag := "unknown"
	if err := json.Unmarshal(inboundConfig, &inboundJSON); err == nil {
		if t, ok := inboundJSON["tag"].(string); ok {
			tag = t
		}
	}

	url := fmt.Sprintf("%s/api/v1/update-inbound", nodeRequestBaseURL(node))
	logger.Debugf("[Node: %s] Updating inbound via API: %s", node.Name, tag)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	logger.Infof("[Node: %s] Inbound %s updated successfully via API (instant)", node.Name, tag)
	return nil
}

// RemoveInboundFromNode removes an inbound configuration on a node via Xray API (instant, no restart).
func (s *NodeService) RemoveInboundFromNode(node *model.Node, tag string) error {
	client, err := s.createHTTPClient(node, 10*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	requestBody := map[string]interface{}{
		"tag": tag,
	}

	requestJSON, err := json.Marshal(requestBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/remove-inbound", nodeRequestBaseURL(node))
	logger.Debugf("[Node: %s] Removing inbound via API: %s", node.Name, tag)

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(requestJSON))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	logger.Infof("[Node: %s] Inbound %s removed successfully via API (instant)", node.Name, tag)
	return nil
}

// getPanelURL constructs the panel URL from settings.
// nodeAddress is optional and can be used to infer panel's external address.
func (s *NodeService) getPanelURL(nodeAddress ...string) string {
	settingService := SettingService{}

	// Get panel settings
	webListen, _ := settingService.GetListen()
	webPort, _ := settingService.GetPort()
	webDomain, _ := settingService.GetWebDomain()
	webCertFile, _ := settingService.GetCertFile()
	webKeyFile, _ := settingService.GetKeyFile()
	webBasePath, _ := settingService.GetBasePath()

	// Determine protocol
	protocol := "http"
	if webCertFile != "" || webKeyFile != "" {
		protocol = "https"
	}

	// Determine host
	host := webDomain
	if host == "" {
		host = webListen
		// If webListen is empty, 0.0.0.0, or ::, try to infer from node address
		if host == "" || host == "0.0.0.0" || host == "::" || host == "::0" {
			// Try to extract IP from node address if provided
			if len(nodeAddress) > 0 && nodeAddress[0] != "" {
				// Extract host from node address (e.g., "http://192.168.0.7:8080" -> "192.168.0.7")
				nodeAddr := nodeAddress[0]
				if strings.HasPrefix(nodeAddr, "http://") {
					nodeAddr = strings.TrimPrefix(nodeAddr, "http://")
				} else if strings.HasPrefix(nodeAddr, "https://") {
					nodeAddr = strings.TrimPrefix(nodeAddr, "https://")
				}
				// Remove port if present
				if idx := strings.LastIndex(nodeAddr, ":"); idx > 0 {
					nodeAddr = nodeAddr[:idx]
				}
				// Use node's IP as panel IP (assuming they're on the same network)
				if nodeAddr != "" && nodeAddr != "127.0.0.1" && nodeAddr != "localhost" {
					host = nodeAddr
				}
			}
			// Final fallback to localhost
			if host == "" || host == "0.0.0.0" || host == "::" || host == "::0" {
				host = "127.0.0.1"
			}
		}
	}

	// Construct URL
	url := fmt.Sprintf("%s://%s", protocol, host)
	if webPort > 0 && webPort != 80 && webPort != 443 {
		url += fmt.Sprintf(":%d", webPort)
	}

	// Add base path (remove trailing slash if present, we'll add it in node)
	basePath := webBasePath
	if basePath != "" && basePath != "/" {
		if !strings.HasSuffix(basePath, "/") {
			basePath += "/"
		}
		url += basePath
	} else {
		url += "/"
	}

	return url
}

// ReloadNode reloads XRAY on a specific node.
func (s *NodeService) ReloadNode(node *model.Node) error {
	client, err := s.createHTTPClient(node, 30*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/reload", nodeRequestBaseURL(node))
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return err
	}

	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		// Check if node is reachable via health endpoint
		healthURL := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
		healthResp, healthErr := client.Get(healthURL)
		if healthErr == nil {
			healthResp.Body.Close()
			if healthResp.StatusCode == http.StatusOK {
				return &ErrNodeNeedsReregistration{NodeName: node.Name}
			}
		}
		return fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ForceReloadNode forcefully reloads XRAY on a specific node (even if hung).
func (s *NodeService) ForceReloadNode(node *model.Node) error {
	client, err := s.createHTTPClient(node, 30*time.Second)
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/force-reload", nodeRequestBaseURL(node))
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return err
	}

	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		// Check if node is reachable via health endpoint
		healthURL := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
		healthResp, healthErr := client.Get(healthURL)
		if healthErr == nil {
			healthResp.Body.Close()
			if healthResp.StatusCode == http.StatusOK {
				return &ErrNodeNeedsReregistration{NodeName: node.Name}
			}
		}
		return fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ReloadAllNodes reloads XRAY on all nodes.
func (s *NodeService) ReloadAllNodes() error {
	nodes, err := s.GetAllNodes()
	if err != nil {
		return fmt.Errorf("failed to get nodes: %w", err)
	}

	type reloadResult struct {
		node *model.Node
		err  error
	}

	enabled := make([]*model.Node, 0, len(nodes))
	for _, node := range nodes {
		if node.Enable {
			enabled = append(enabled, node)
		}
	}
	results := make(chan reloadResult, len(enabled))
	for _, node := range enabled {
		go func(n *model.Node) {
			err := s.ForceReloadNode(n) // Use force reload to handle hung nodes
			results <- reloadResult{node: n, err: err}
		}(node)
	}

	var errors []string
	for i := 0; i < len(enabled); i++ {
		result := <-results
		if result.err != nil {
			errors = append(errors, fmt.Sprintf("node %d (%s): %v", result.node.Id, result.node.Name, result.err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("failed to reload some nodes: %s", strings.Join(errors, "; "))
	}

	return nil
}

// GetNodeStatus retrieves the status of a node.
func (s *NodeService) GetNodeStatus(node *model.Node) (map[string]interface{}, error) {
	client, err := s.createHTTPClient(node, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP client: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/status", nodeRequestBaseURL(node))
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}

	if err := s.setNodeAuthHeader(node, req); err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Check if node is reachable but API key is invalid (401 Unauthorized)
	// This typically means node was recreated and needs re-registration
	if resp.StatusCode == http.StatusUnauthorized {
		// Verify node is reachable via health endpoint (doesn't require API key)
		healthURL := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
		healthResp, healthErr := client.Get(healthURL)
		if healthErr == nil {
			healthResp.Body.Close()
			if healthResp.StatusCode == http.StatusOK {
				// Node is reachable but API key is invalid - needs re-registration
				return nil, &ErrNodeNeedsReregistration{NodeName: node.Name}
			}
		}
		return nil, fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("node returned status %d", resp.StatusCode)
	}

	var status map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return nil, err
	}

	return status, nil
}

// GetNodeXrayVersion retrieves the Xray version from a node.
// Returns empty string if version cannot be retrieved.
func (s *NodeService) GetNodeXrayVersion(node *model.Node) string {
	status, err := s.GetNodeStatus(node)
	if err != nil {
		return ""
	}

	if version, ok := status["version"].(string); ok && version != "" {
		// Return "Unknown" as empty string to match frontend display logic
		if version == "Unknown" {
			return ""
		}
		return version
	}

	return ""
}

// GetNodeLogs retrieves XRAY access logs from a node.
// Returns raw log lines as strings.
func (s *NodeService) GetNodeLogs(node *model.Node, count int, filter string) ([]string, error) {
	client, err := s.createHTTPClient(node, 10*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to create HTTP client: %w", err)
	}

	url := fmt.Sprintf("%s/api/v1/logs?count=%d", nodeRequestBaseURL(node), count)
	if filter != "" {
		url += "&filter=" + filter
	}

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	if err := s.setNodeAuthHeader(node, req); err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to request node logs: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		// Check if node is reachable via health endpoint
		healthURL := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
		healthResp, healthErr := client.Get(healthURL)
		if healthErr == nil {
			healthResp.Body.Close()
			if healthResp.StatusCode == http.StatusOK {
				return nil, &ErrNodeNeedsReregistration{NodeName: node.Name}
			}
		}
		return nil, fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("node returned status code %d: %s", resp.StatusCode, string(body))
	}

	var response struct {
		Logs []string `json:"logs"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return response.Logs, nil
}

// InstallXrayVersion installs a specific Xray version on a node.
func (s *NodeService) InstallXrayVersion(node *model.Node, version string) error {
	client, err := s.createHTTPClient(node, 300*time.Second) // 5 minutes timeout for download
	if err != nil {
		return fmt.Errorf("failed to create HTTP client: %w", err)
	}

	// Remove 'v' prefix if present
	if strings.HasPrefix(version, "v") {
		version = version[1:]
	}

	url := fmt.Sprintf("%s/api/v1/install-xray/%s", nodeRequestBaseURL(node), version)
	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	if err := s.setNodeAuthHeader(node, req); err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		// Check if node is reachable via health endpoint
		healthURL := fmt.Sprintf("%s/health", nodeRequestBaseURL(node))
		healthResp, healthErr := client.Get(healthURL)
		if healthErr == nil {
			healthResp.Body.Close()
			if healthResp.StatusCode == http.StatusOK {
				return &ErrNodeNeedsReregistration{NodeName: node.Name}
			}
		}
		return fmt.Errorf("invalid API key")
	}

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("node returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
