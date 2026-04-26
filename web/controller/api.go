package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/pairing_outbound"
	"github.com/konstpic/sharx-code/v2/web/service"
	"github.com/konstpic/sharx-code/v2/web/session"

	"github.com/gin-gonic/gin"
)

// APIController handles the main API routes for the SharX panel, including inbounds and server management.
type APIController struct {
	BaseController
	inboundController *InboundController
	serverController  *ServerController
	Tgbot             service.Tgbot
	docsFS            fs.FS // Embedded docs filesystem
}

// NewAPIController creates a new APIController instance and initializes its routes.
func NewAPIController(g *gin.RouterGroup) *APIController {
	a := &APIController{}
	a.initRouter(g)
	return a
}

// SetDocsFS sets the embedded docs filesystem for the API controller.
func (a *APIController) SetDocsFS(docsFS fs.FS) {
	a.docsFS = docsFS
}

// checkAPIAuth is a middleware that returns 404 for unauthenticated API requests
// to hide the existence of API endpoints from unauthorized users
func (a *APIController) checkAPIAuth(c *gin.Context) {
	TryAttachAPITokenFromBearer(c)
	if !session.IsLogin(c) {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}
	c.Next()
}

// initRouter sets up the API routes for inbounds, server, and other endpoints.
func (a *APIController) initRouter(g *gin.RouterGroup) {
	registerPublicSubscriptionRoutes(g, nil)

	// Node push-logs endpoint (no session auth, uses API key)
	// Register in separate group without session auth middleware
	nodeAPI := g.Group("/panel/api/node")
	nodeAPI.POST("/push-logs", a.pushNodeLogs)
	nodeAPI.POST("/push-geo", a.pushNodeGeo)
	nodeAPI.POST("/pull-xray-config", a.pullWorkerXrayConfig)

	// Main API group with session auth
	api := g.Group("/panel/api")
	api.Use(a.checkAPIAuth)

	// Inbounds API
	inbounds := api.Group("/inbounds")
	a.inboundController = NewInboundController(inbounds)

	// Server API
	server := api.Group("/server")
	a.serverController = NewServerController(server)

	// Extra routes
	api.GET("/backuptotgbot", a.BackuptoTgbot)

	a.registerAPITokenRoutes(api)

	// API Documentation
	apiDocs := api.Group("/api-docs")
	apiDocs.GET("/markdown", a.getAPIDocsMarkdown)
}

// BackuptoTgbot sends a backup of the panel data to Telegram bot admins.
func (a *APIController) BackuptoTgbot(c *gin.Context) {
	a.Tgbot.SendBackupToAdmins()
}

// extractPort extracts port number from URL address (e.g., "http://192.168.0.7:8080" -> "8080")
func extractPort(address string) string {
	re := regexp.MustCompile(`:(\d+)(?:/|$)`)
	matches := re.FindStringSubmatch(address)
	if len(matches) > 1 {
		return matches[1]
	}
	return ""
}

func parseSharxV1Signature(s string) (hex string, ok bool) {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "v1=") {
		return "", false
	}
	return strings.TrimSpace(s[3:]), true
}

// findNodeByAddressForLogPush matches the panel node row by public URL (exact or by port for localhost vs LAN).
func findNodeByAddressForLogPush(nodes []*model.Node, nodeAddress string) *model.Node {
	reqAddr := strings.TrimSuffix(strings.TrimSpace(nodeAddress), "/")
	reqPort := extractPort(reqAddr)
	for _, n := range nodes {
		nodeAddr := strings.TrimSuffix(strings.TrimSpace(n.Address), "/")
		nodePort := extractPort(nodeAddr)
		if nodeAddr == reqAddr || (nodePort != "" && nodePort == reqPort) {
			return n
		}
	}
	return nil
}

// pushNodeLogs receives logs from a node; authenticates with X-Sharx-Signature (HMAC, pairing).
func (a *APIController) pushNodeLogs(c *gin.Context) {
	const sigHeader = "X-Sharx-Signature"

	type PushLogRequest struct {
		NodeAddress string   `json:"nodeAddress,omitempty"`
		Logs        []string `json:"logs" binding:"required"`
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read body"})
		return
	}
	_ = c.Request.Body.Close()
	c.Request.Body = io.NopCloser(bytes.NewReader(body))

	var req PushLogRequest
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON: " + err.Error()})
		return
	}
	if len(req.Logs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "logs is required"})
		return
	}

	nodeService := service.NodeService{}
	nodes, err := nodeService.GetAllNodes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get nodes"})
		return
	}

	sig := strings.TrimSpace(c.GetHeader(sigHeader))
	if sig == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": sigHeader + " (HMAC v1) is required"})
		return
	}
	v1, ok := parseSharxV1Signature(sig)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid " + sigHeader + " (expected v1=hex)"})
		return
	}
	pairing := &service.PanelPairingService{}
	key, err := pairing.GetOutboundHMACKey()
	if err != nil {
		logger.Errorf("pairing HMAC key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Pairing not configured"})
		return
	}
	if !pairing_outbound.ValidSignature(key, body, v1) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}
	if strings.TrimSpace(req.NodeAddress) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nodeAddress is required"})
		return
	}
	node := findNodeByAddressForLogPush(nodes, req.NodeAddress)
	if node == nil {
		logger.Debugf("HMAC log push: no node for address %s", req.NodeAddress)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unknown node for address"})
		return
	}

	// Log which node is sending logs (for debugging)
	logger.Debugf("Received %d logs from node: %s (ID: %d, Address: %s)",
		len(req.Logs), node.Name, node.Id, node.Address)

	// Process and add logs to panel buffer
	for _, logLine := range req.Logs {
		if logLine == "" {
			continue
		}

		// Parse log line: format is "timestamp level - message"
		var level string
		var message string

		if idx := strings.Index(logLine, " - "); idx != -1 {
			parts := strings.SplitN(logLine, " - ", 2)
			if len(parts) == 2 {
				levelPart := strings.TrimSpace(parts[0])
				levelFields := strings.Fields(levelPart)
				if len(levelFields) >= 2 {
					level = strings.ToUpper(levelFields[len(levelFields)-1])
					message = parts[1]
				} else {
					level = "INFO"
					message = parts[1]
				}
			} else {
				level = "INFO"
				message = logLine
			}
		} else {
			level = "INFO"
			message = logLine
		}

		// Add log to panel buffer with node prefix
		formattedMessage := fmt.Sprintf("[Node: %s] %s", node.Name, message)
		switch level {
		case "DEBUG":
			logger.Debugf("%s", formattedMessage)
		case "WARNING":
			logger.Warningf("%s", formattedMessage)
		case "ERROR":
			logger.Errorf("%s", formattedMessage)
		case "NOTICE":
			logger.Noticef("%s", formattedMessage)
		default:
			logger.Infof("%s", formattedMessage)
		}

		// Also send to Loki with node component and node ID
		nodeIDStr := fmt.Sprintf("%d", node.Id)
		logger.PushLogToLokiWithComponent(level, message, "node", nodeIDStr)
	}

	c.JSON(http.StatusOK, gin.H{"message": "Logs received"})
}

// pushNodeGeo receives approximate lat/lon from a worker (HMAC, pairing); same auth as push-logs.
func (a *APIController) pushNodeGeo(c *gin.Context) {
	const sigHeader = "X-Sharx-Signature"

	type pushGeoRequest struct {
		NodeAddress string  `json:"nodeAddress"`
		Lat         float64 `json:"lat"`
		Lng         float64 `json:"lng"`
		Source      string  `json:"source,omitempty"`
		IP          string  `json:"ip,omitempty"`
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read body"})
		return
	}
	_ = c.Request.Body.Close()
	c.Request.Body = io.NopCloser(bytes.NewReader(body))

	var req pushGeoRequest
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON: " + err.Error()})
		return
	}
	if strings.TrimSpace(req.NodeAddress) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nodeAddress is required"})
		return
	}
	if req.Lat < -90 || req.Lat > 90 || req.Lng < -180 || req.Lng > 180 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid coordinates"})
		return
	}

	sig := strings.TrimSpace(c.GetHeader(sigHeader))
	if sig == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": sigHeader + " (HMAC v1) is required"})
		return
	}
	v1, ok := parseSharxV1Signature(sig)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid " + sigHeader + " (expected v1=hex)"})
		return
	}
	pairing := &service.PanelPairingService{}
	key, err := pairing.GetOutboundHMACKey()
	if err != nil {
		logger.Errorf("pairing HMAC key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Pairing not configured"})
		return
	}
	if !pairing_outbound.ValidSignature(key, body, v1) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	nodeService := service.NodeService{}
	node, err := nodeService.FindNodeByPushAddress(req.NodeAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get nodes"})
		return
	}
	if node == nil {
		logger.Debugf("HMAC geo push: no node for address %s", req.NodeAddress)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unknown node for address"})
		return
	}

	src := strings.TrimSpace(req.Source)
	if src == "" {
		src = "unknown"
	}
	if err := nodeService.UpdateNodeGeography(node.Id, req.Lat, req.Lng, src); err != nil {
		logger.Errorf("geo push update node %d: %v", node.Id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save geography"})
		return
	}
	logger.Debugf("Geo push: node %s (%d) → %.4f, %.4f (%s, ip=%s)", node.Name, node.Id, req.Lat, req.Lng, src, strings.TrimSpace(req.IP))
	c.JSON(http.StatusOK, gin.H{"message": "Geography received"})
}

// pullWorkerXrayConfig returns the current Xray JSON for a worker (HMAC, pairing); same auth as push-geo.
func (a *APIController) pullWorkerXrayConfig(c *gin.Context) {
	const sigHeader = "X-Sharx-Signature"

	type pullReq struct {
		NodeAddress string `json:"nodeAddress"`
	}

	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to read body"})
		return
	}
	_ = c.Request.Body.Close()
	c.Request.Body = io.NopCloser(bytes.NewReader(body))

	var req pullReq
	if err := json.Unmarshal(body, &req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON: " + err.Error()})
		return
	}
	if strings.TrimSpace(req.NodeAddress) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nodeAddress is required"})
		return
	}

	sig := strings.TrimSpace(c.GetHeader(sigHeader))
	if sig == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": sigHeader + " (HMAC v1) is required"})
		return
	}
	v1, ok := parseSharxV1Signature(sig)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid " + sigHeader + " (expected v1=hex)"})
		return
	}
	pairing := &service.PanelPairingService{}
	key, err := pairing.GetOutboundHMACKey()
	if err != nil {
		logger.Errorf("pairing HMAC key: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Pairing not configured"})
		return
	}
	if !pairing_outbound.ValidSignature(key, body, v1) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid signature"})
		return
	}

	nodeService := service.NodeService{}
	node, err := nodeService.FindNodeByPushAddress(req.NodeAddress)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get nodes"})
		return
	}
	if node == nil {
		logger.Debugf("HMAC pull-xray-config: no node for address %s", req.NodeAddress)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unknown node for address"})
		return
	}
	if !node.Enable {
		c.JSON(http.StatusForbidden, gin.H{"error": "Node is disabled"})
		return
	}

	xraySvc := service.NewXrayService()
	configJSON, err := xraySvc.BuildWorkerXrayConfigForNode(node)
	if err != nil {
		logger.Errorf("pull-xray-config build for node %d: %v", node.Id, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to build configuration"})
		return
	}

	type pullResp struct {
		Config json.RawMessage `json:"config"`
	}
	logger.Debugf("pull-xray-config: node %s (%d), %d bytes", node.Name, node.Id, len(configJSON))
	c.JSON(http.StatusOK, pullResp{Config: configJSON})
}

// getAPIDocsMarkdown returns the API documentation markdown file.
func (a *APIController) getAPIDocsMarkdown(c *gin.Context) {
	var content []byte
	var err error

	// Try reading from embedded docs filesystem first
	if a.docsFS != nil {
		// When using //go:embed docs, files are accessible as "docs/API.md"
		apiDocPaths := []string{"docs/API.md", "API.md"}
		for _, path := range apiDocPaths {
			content, err = fs.ReadFile(a.docsFS, path)
			if err == nil {
				c.Header("Content-Type", "text/markdown; charset=utf-8")
				c.String(http.StatusOK, string(content))
				return
			}
		}
		logger.Debugf("Failed to read API.md from embedded filesystem (trying disk): %v", err)
	}

	// Fallback to disk
	diskPaths := []string{"web/docs/API.md", "docs/API.md", "API.md"}
	for _, path := range diskPaths {
		content, err = os.ReadFile(path)
		if err == nil {
			logger.Debugf("Successfully read API.md from disk: %s", path)
			c.Header("Content-Type", "text/markdown; charset=utf-8")
			c.String(http.StatusOK, string(content))
			return
		}
	}

	logger.Warningf("Failed to read API.md: %v", err)
	c.String(http.StatusNotFound, "API documentation not found")
}
