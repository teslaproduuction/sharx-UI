package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"

	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/xray"

	"go.uber.org/atomic"
)

var (
	p                 *xray.Process
	lock              sync.Mutex
	isNeedXrayRestart atomic.Bool // Indicates that restart was requested for Xray
	isManuallyStopped atomic.Bool // Indicates that Xray was stopped manually from the panel
	result            string
	// API connection pool: map[apiPort]*xray.XrayAPI
	apiConnectionPool sync.Map
	apiPoolLock       sync.Mutex
	// When local Xray is not running (multi-node), the online set is not stored on *Process p.
	// We keep a copy here so GetOnlineClients() / WebSocket traffic broadcast still work.
	panelOnlineMu     sync.RWMutex
	panelOnlineEmails []string
)

// setPanelOnlineClients updates the in-memory online list. When local Xray is running,
// the same list is also applied to the *Process. When p is nil (typical in multi-node),
// only the snapshot is updated — otherwise panel would always show all clients as offline.
func setPanelOnlineClients(emails []string) {
	cpy := append([]string(nil), emails...)
	panelOnlineMu.Lock()
	panelOnlineEmails = cpy
	panelOnlineMu.Unlock()
	if p != nil {
		p.SetOnlineClients(cpy)
	}
}

// getPanelOnlineClients returns the current online list from the local Xray when it exists,
// otherwise the last snapshot (multi-node, node traffic collection, etc.).
func getPanelOnlineClients() []string {
	if p != nil {
		return p.GetOnlineClients()
	}
	panelOnlineMu.RLock()
	defer panelOnlineMu.RUnlock()
	return append([]string(nil), panelOnlineEmails...)
}

// XrayService provides business logic for Xray process management.
// It handles starting, stopping, restarting Xray, and managing its configuration.
// In multi-node mode, it sends configurations to nodes instead of running Xray locally.
type XrayService struct {
	inboundService InboundService
	settingService SettingService
	nodeService    NodeService
	xrayAPI        xray.XrayAPI
}

// NewXrayService creates a new XrayService with default dependencies.
// This is used in places (like application startup) where we don't have
// an already-wired instance but need to operate on Xray configuration.
func NewXrayService() XrayService {
	return XrayService{
		inboundService: InboundService{},
		settingService: SettingService{},
		nodeService:    NodeService{},
	}
}

// IsXrayRunning checks if the Xray process is currently running.
func (s *XrayService) IsXrayRunning() bool {
	return p != nil && p.IsRunning()
}

// GetAPIPort returns the API port of the running Xray process.
func (s *XrayService) GetAPIPort() int {
	if p != nil && p.IsRunning() {
		return p.GetAPIPort()
	}
	return 0
}

// GetConfig returns the current Xray configuration.
func (s *XrayService) GetConfig() *xray.Config {
	if p != nil && p.IsRunning() {
		return p.GetConfig()
	}
	return nil
}

// GetOrCreateAPI gets or creates a cached XrayAPI connection for the given API port.
// This reuses connections to avoid the overhead of creating new gRPC connections.
// Returns the API client and a cleanup function that should be called when done.
// Note: The cleanup function does NOT close the connection (it's reused), it just releases the reference.
func (s *XrayService) GetOrCreateAPI(apiPort int) (*xray.XrayAPI, func(), error) {
	if apiPort <= 0 {
		return nil, nil, fmt.Errorf("invalid API port: %d", apiPort)
	}

	// Try to get existing connection
	if conn, ok := apiConnectionPool.Load(apiPort); ok {
		api := conn.(*xray.XrayAPI)
		if api.IsConnected() {
			// Connection is still valid, reuse it
			return api, func() {
				// No-op: connection stays in pool for reuse
			}, nil
		}
		// Connection is dead, remove it from pool
		apiConnectionPool.Delete(apiPort)
	}

	// Create new connection
	apiPoolLock.Lock()
	defer apiPoolLock.Unlock()

	// Double-check after acquiring lock (another goroutine might have created it)
	if conn, ok := apiConnectionPool.Load(apiPort); ok {
		api := conn.(*xray.XrayAPI)
		if api.IsConnected() {
			return api, func() {}, nil
		}
	}

	// Create new API connection
	api := &xray.XrayAPI{}
	if err := api.Init(apiPort); err != nil {
		return nil, nil, fmt.Errorf("failed to init XrayAPI: %w", err)
	}

	// Store in pool
	apiConnectionPool.Store(apiPort, api)

	return api, func() {
		// No-op: connection stays in pool for reuse
	}, nil
}

// CloseAPIConnections closes all cached API connections.
// This should be called when Xray is stopped or restarted.
func (s *XrayService) CloseAPIConnections() {
	apiConnectionPool.Range(func(key, value interface{}) bool {
		api := value.(*xray.XrayAPI)
		api.Close()
		apiConnectionPool.Delete(key)
		return true
	})
	logger.Debug("All API connections closed")
}

// GetXrayErr returns the error from the Xray process, if any.
func (s *XrayService) GetXrayErr() error {
	if p == nil {
		return nil
	}

	err := p.GetErr()

	if runtime.GOOS == "windows" && err.Error() == "exit status 1" {
		// exit status 1 on Windows means that Xray process was killed
		// as we kill process to stop in on Windows, this is not an error
		return nil
	}

	return err
}

// GetXrayResult returns the result string from the Xray process.
func (s *XrayService) GetXrayResult() string {
	if result != "" {
		return result
	}
	if s.IsXrayRunning() {
		return ""
	}
	if p == nil {
		return ""
	}

	result = p.GetResult()

	if runtime.GOOS == "windows" && result == "exit status 1" {
		// exit status 1 on Windows means that Xray process was killed
		// as we kill process to stop in on Windows, this is not an error
		return ""
	}

	return result
}

// GetXrayVersion returns the version of the running Xray process.
func (s *XrayService) GetXrayVersion() string {
	if p == nil {
		return "Unknown"
	}
	return p.GetVersion()
}

// RemoveIndex removes an element at the specified index from a slice.
// Returns a new slice with the element removed.
func RemoveIndex(s []any, index int) []any {
	return append(s[:index], s[index+1:]...)
}

// normalizeHysteriaClientAuth maps legacy settings.clients[].password to auth (Xray Hysteria inbound
// only accepts auth per Project X docs) and drops password so the core never sees the wrong key.
func normalizeHysteriaClientAuth(c map[string]any) {
	if c == nil {
		return
	}
	auth := ""
	if s, ok := c["auth"].(string); ok {
		auth = strings.TrimSpace(s)
	}
	if s, ok := c["password"].(string); ok && auth == "" {
		auth = strings.TrimSpace(s)
	}
	if auth != "" {
		c["auth"] = auth
	}
	delete(c, "password")
}

// ApplyPanelInboundTransformsForXray applies the same settings/stream mutations as
// GetXrayConfig for one inbound before BuildInboundXrayConfig. Mutates inbound in place.
func ApplyPanelInboundTransformsForXray(inbound *model.Inbound) error {
	if inbound == nil {
		return nil
	}
	settings := map[string]any{}
	json.Unmarshal([]byte(inbound.Settings), &settings)
	clients, ok := settings["clients"].([]any)
	if ok {
		clientStats := inbound.ClientStats
		for _, clientTraffic := range clientStats {
			indexDecrease := 0
			for index, client := range clients {
				c := client.(map[string]any)
				if c["email"] == clientTraffic.Email {
					if !clientTraffic.Enable {
						clients = RemoveIndex(clients, index-indexDecrease)
						indexDecrease++
						logger.Infof("Remove Inbound User %s due to expiration or traffic limit", c["email"])
					}
				}
			}
		}

		var finalClients []any
		for _, client := range clients {
			c := client.(map[string]any)
			if c["enable"] != nil {
				if enable, ok := c["enable"].(bool); ok && !enable {
					continue
				}
			}
			for key := range c {
				if key != "email" && key != "id" && key != "password" && key != "auth" && key != "flow" && key != "method" {
					delete(c, key)
				}
				if c["flow"] == "xtls-rprx-vision-udp443" {
					c["flow"] = "xtls-rprx-vision"
				}
			}
			if model.IsHysteria(inbound.Protocol) {
				normalizeHysteriaClientAuth(c)
			}
			finalClients = append(finalClients, any(c))
		}

		settings["clients"] = finalClients
		modifiedSettings, err := json.MarshalIndent(settings, "", "  ")
		if err != nil {
			return err
		}
		inbound.Settings = string(modifiedSettings)
	}

	if len(inbound.StreamSettings) > 0 {
		var stream map[string]any
		json.Unmarshal([]byte(inbound.StreamSettings), &stream)

		tlsSettings, ok1 := stream["tlsSettings"].(map[string]any)
		realitySettings, ok2 := stream["realitySettings"].(map[string]any)
		if ok1 || ok2 {
			if ok1 {
				delete(tlsSettings, "settings")
			} else if ok2 {
				delete(realitySettings, "settings")
			}
		}
		delete(stream, "externalProxy")
		newStream, err := json.MarshalIndent(stream, "", "  ")
		if err != nil {
			return err
		}
		inbound.StreamSettings = string(newStream)
	}
	return nil
}

// PreviewInboundCoreConfig builds the Xray core inbound detour (same as in the generated config) from panel inbound fields.
func (s *XrayService) PreviewInboundCoreConfig(inbound *model.Inbound) (*xray.InboundConfig, error) {
	if inbound == nil {
		return nil, errors.New("inbound is nil")
	}
	hyCert, _ := s.settingService.GetCertFile()
	hyKey, _ := s.settingService.GetKeyFile()
	if err := ApplyPanelInboundTransformsForXray(inbound); err != nil {
		return nil, err
	}
	cfg := BuildInboundXrayConfig(inbound, hyCert, hyKey)
	if cfg == nil {
		return nil, errors.New("failed to build Xray inbound config")
	}
	return cfg, nil
}

// GetXrayConfig retrieves and builds the Xray configuration from settings and inbounds.
func (s *XrayService) GetXrayConfig() (*xray.Config, error) {
	// Ensure xrayTemplateConfig is valid before using it.
	// This is critical when updating only the panel image without DB migrations,
	// as old JSON in the DB may be incompatible with the new code.
	if err := s.settingService.EnsureXrayTemplateConfigValid(); err != nil {
		logger.Debugf("[DEBUG-AGENT] GetXrayConfig: failed EnsureXrayTemplateConfigValid: %v", err)
		// Continue anyway; GetXrayConfigTemplate() will still try to return something.
	}

	templateConfig, err := s.settingService.GetXrayConfigTemplate()
	if err != nil {
		logger.Debugf("[DEBUG-AGENT] GetXrayConfig: GetXrayConfigTemplate error: %v", err)
		return nil, err
	}

	xrayConfig := &xray.Config{}
	err = json.Unmarshal([]byte(templateConfig), xrayConfig)
	if err != nil {
		logger.Debugf("[DEBUG-AGENT] GetXrayConfig: failed to unmarshal template JSON: %v", err)
		return nil, err
	}
	xray.EnsurePolicyStatsUserOnline(xrayConfig)

	s.inboundService.AddTraffic(nil, nil)

	inbounds, err := s.inboundService.GetAllInbounds()
	if err != nil {
		return nil, err
	}
	hyCert, _ := s.settingService.GetCertFile()
	hyKey, _ := s.settingService.GetKeyFile()
	for _, inbound := range inbounds {
		if !inbound.Enable {
			continue
		}
		if err := ApplyPanelInboundTransformsForXray(inbound); err != nil {
			return nil, err
		}
		inboundConfig := BuildInboundXrayConfig(inbound, hyCert, hyKey)
		xrayConfig.InboundConfigs = append(xrayConfig.InboundConfigs, *inboundConfig)
	}
	return xrayConfig, nil
}

// GetXrayTraffic fetches the current traffic statistics from the running Xray process.
func (s *XrayService) GetXrayTraffic() ([]*xray.Traffic, []*xray.ClientTraffic, error) {
	if !s.IsXrayRunning() {
		err := errors.New("xray is not running")
		logger.Debug("Attempted to fetch Xray traffic, but Xray is not running:", err)
		return nil, nil, err
	}
	apiPort := p.GetAPIPort()
	api, cleanup, err := s.GetOrCreateAPI(apiPort)
	if err != nil {
		return nil, nil, err
	}
	defer cleanup()

	traffic, clientTraffic, err := api.GetTraffic(true)
	if err != nil {
		logger.Debug("Failed to fetch Xray traffic:", err)
		return nil, nil, err
	}
	return traffic, clientTraffic, nil
}

// GetXrayTrafficNoReset fetches cumulative traffic counters from Xray without reset.
func (s *XrayService) GetXrayTrafficNoReset() ([]*xray.Traffic, []*xray.ClientTraffic, error) {
	if !s.IsXrayRunning() {
		err := errors.New("xray is not running")
		logger.Debug("Attempted to fetch Xray traffic (no reset), but Xray is not running:", err)
		return nil, nil, err
	}
	apiPort := p.GetAPIPort()
	api, cleanup, err := s.GetOrCreateAPI(apiPort)
	if err != nil {
		return nil, nil, err
	}
	defer cleanup()

	traffic, clientTraffic, err := api.GetTraffic(false)
	if err != nil {
		logger.Debug("Failed to fetch Xray traffic (no reset):", err)
		return nil, nil, err
	}
	return traffic, clientTraffic, nil
}

// RestartXray restarts the Xray process, optionally forcing a restart even if config unchanged.
// In multi-node mode, it sends configurations to nodes instead of restarting local Xray.
func (s *XrayService) RestartXray(isForce bool) error {
	lock.Lock()
	defer lock.Unlock()
	logger.Debug("restart Xray, force:", isForce)
	isManuallyStopped.Store(false)

	// Check if multi-node mode is enabled
	multiMode, err := s.settingService.GetMultiNodeMode()
	if err != nil {
		multiMode = false // Default to single mode on error
	}

	if multiMode {
		return s.restartXrayMultiMode(isForce)
	}

	// Single mode: use local Xray
	xrayConfig, err := s.GetXrayConfig()
	if err != nil {
		return err
	}

	if s.IsXrayRunning() {
		if !isForce && p.GetConfig().Equals(xrayConfig) && !isNeedXrayRestart.Load() {
			logger.Debug("It does not need to restart Xray")
			return nil
		}
		// Close API connections before stopping Xray
		s.CloseAPIConnections()
		p.Stop()
	}

	p = xray.NewProcess(xrayConfig)
	result = ""
	err = p.Start()
	if err != nil {
		return err
	}

	return nil
}

// RestartXrayAsync restarts Xray asynchronously in a goroutine.
// This is useful when you don't want to block the HTTP response waiting for configs to be sent to nodes.
// Errors are logged but not returned.
func (s *XrayService) RestartXrayAsync(isForce bool) {
	go func() {
		if err := s.RestartXray(isForce); err != nil {
			logger.Warningf("Failed to restart Xray asynchronously: %v", err)
		} else {
			logger.Debug("Xray restarted asynchronously")
		}
	}()
}

// buildNodeWorkerConfigJSON builds the same Xray JSON that ApplyConfigToNode sends for one node.
func (s *XrayService) buildNodeWorkerConfigJSON(node *model.Node, inbounds []*model.Inbound, baseConfig *xray.Config, hyCert, hyKey string) ([]byte, error) {
	// Determine which core config profile to use
	var coreConfigProfile *model.XrayCoreConfigProfile
	profileService := XrayCoreConfigProfileService{}

	if len(inbounds) > 0 {
		profiles, err := profileService.GetAllProfiles(inbounds[0].UserId)
		if err == nil {
			for _, profile := range profiles {
				for _, profileNodeId := range profile.NodeIds {
					if profileNodeId == node.Id {
						coreConfigProfile = profile
						break
					}
				}
				if coreConfigProfile != nil {
					break
				}
			}
		}

		if coreConfigProfile == nil {
			profile, err := profileService.EnsureDefaultProfile(inbounds[0].UserId)
			if err == nil && profile != nil {
				coreConfigProfile = profile
			}
		}
	}

	var configToUse *xray.Config
	if coreConfigProfile != nil {
		configToUse = &xray.Config{}
		if err := json.Unmarshal([]byte(coreConfigProfile.ConfigJson), configToUse); err == nil {
			// ok
		} else {
			configToUse = baseConfig
		}
	} else {
		configToUse = baseConfig
	}

	nodeConfig := *configToUse
	xray.EnsurePolicyStatsUserOnline(&nodeConfig)
	apiInbound := xray.InboundConfig{}
	hasAPIInbound := false
	for _, inbound := range baseConfig.InboundConfigs {
		if inbound.Tag == "api" {
			apiInbound = inbound
			hasAPIInbound = true
			break
		}
	}
	nodeConfig.InboundConfigs = []xray.InboundConfig{}
	if hasAPIInbound {
		nodeConfig.InboundConfigs = append(nodeConfig.InboundConfigs, apiInbound)
	}

	for _, inbound := range inbounds {
		settings := map[string]any{}
		json.Unmarshal([]byte(inbound.Settings), &settings)
		clients, ok := settings["clients"].([]any)
		if ok {
			clientStats := inbound.ClientStats
			for _, clientTraffic := range clientStats {
				indexDecrease := 0
				for index, client := range clients {
					c := client.(map[string]any)
					if c["email"] == clientTraffic.Email {
						if !clientTraffic.Enable {
							clients = RemoveIndex(clients, index-indexDecrease)
							indexDecrease++
						}
					}
				}
			}

			var final_clients []any
			for _, client := range clients {
				c := client.(map[string]any)
				if c["enable"] != nil {
					if enable, ok := c["enable"].(bool); ok && !enable {
						continue
					}
				}
				for key := range c {
					if key != "email" && key != "id" && key != "password" && key != "auth" && key != "flow" && key != "method" {
						delete(c, key)
					}
					if c["flow"] == "xtls-rprx-vision-udp443" {
						c["flow"] = "xtls-rprx-vision"
					}
				}
				if model.IsHysteria(inbound.Protocol) {
					normalizeHysteriaClientAuth(c)
				}
				final_clients = append(final_clients, any(c))
			}

			settings["clients"] = final_clients
			modifiedSettings, _ := json.MarshalIndent(settings, "", "  ")
			inbound.Settings = string(modifiedSettings)
		}

		if len(inbound.StreamSettings) > 0 {
			var stream map[string]any
			json.Unmarshal([]byte(inbound.StreamSettings), &stream)
			tlsSettings, ok1 := stream["tlsSettings"].(map[string]any)
			realitySettings, ok2 := stream["realitySettings"].(map[string]any)
			if ok1 || ok2 {
				if ok1 {
					delete(tlsSettings, "settings")
				} else if ok2 {
					delete(realitySettings, "settings")
				}
			}
			delete(stream, "externalProxy")
			newStream, _ := json.MarshalIndent(stream, "", "  ")
			inbound.StreamSettings = string(newStream)
		}

		inboundConfig := BuildInboundXrayConfig(inbound, hyCert, hyKey)
		nodeConfig.InboundConfigs = append(nodeConfig.InboundConfigs, *inboundConfig)
	}

	return json.MarshalIndent(&nodeConfig, "", "  ")
}

// BuildWorkerXrayConfigForNode returns the Xray config JSON for a worker node (same as apply-config payload).
func (s *XrayService) BuildWorkerXrayConfigForNode(node *model.Node) ([]byte, error) {
	if node == nil {
		return nil, fmt.Errorf("node is nil")
	}
	if s.nodeService == (NodeService{}) {
		s.nodeService = NodeService{}
	}
	if s.inboundService == (InboundService{}) {
		s.inboundService = InboundService{}
	}
	if s.settingService == (SettingService{}) {
		s.settingService = SettingService{}
	}

	nodeInbounds := make(map[int][]*model.Inbound)
	allInbounds, err := s.inboundService.GetAllInbounds()
	if err != nil {
		return nil, fmt.Errorf("failed to get inbounds: %w", err)
	}

	if err := s.settingService.EnsureXrayTemplateConfigValid(); err != nil {
		logger.Warningf("Failed to ensure xrayTemplateConfig is valid in BuildWorkerXrayConfigForNode: %v", err)
	}

	templateConfig, err := s.settingService.GetXrayConfigTemplate()
	if err != nil {
		return nil, err
	}

	baseConfig := &xray.Config{}
	if err := json.Unmarshal([]byte(templateConfig), baseConfig); err != nil {
		return nil, err
	}

	for _, inbound := range allInbounds {
		if !inbound.Enable {
			continue
		}
		nodesForIB, err := s.nodeService.GetNodesForInbound(inbound.Id)
		if err != nil || len(nodesForIB) == 0 {
			logger.Debugf("Inbound %d is not assigned to any node, skipping", inbound.Id)
			continue
		}
		for _, n := range nodesForIB {
			nodeInbounds[n.Id] = append(nodeInbounds[n.Id], inbound)
		}
	}

	hyCert, _ := s.settingService.GetCertFile()
	hyKey, _ := s.settingService.GetKeyFile()

	var ibs []*model.Inbound
	if v, ok := nodeInbounds[node.Id]; ok {
		ibs = v
	}
	return s.buildNodeWorkerConfigJSON(node, ibs, baseConfig, hyCert, hyKey)
}

// restartXrayMultiMode handles Xray restart in multi-node mode by sending configs to nodes.
func (s *XrayService) restartXrayMultiMode(isForce bool) error {
	// Initialize nodeService if not already initialized
	if s.nodeService == (NodeService{}) {
		s.nodeService = NodeService{}
	}

	// Get all nodes
	nodes, err := s.nodeService.GetAllNodes()
	if err != nil {
		return fmt.Errorf("failed to get nodes: %w", err)
	}

	// Group inbounds by node
	nodeInbounds := make(map[int][]*model.Inbound)
	allInbounds, err := s.inboundService.GetAllInbounds()
	if err != nil {
		return fmt.Errorf("failed to get inbounds: %w", err)
	}

	// Get template config (ensure it's valid first)
	if err := s.settingService.EnsureXrayTemplateConfigValid(); err != nil {
		logger.Warningf("Failed to ensure xrayTemplateConfig is valid in restartXrayMultiMode: %v", err)
		// Continue anyway; we'll still try to use what we have.
	}

	templateConfig, err := s.settingService.GetXrayConfigTemplate()
	if err != nil {
		return err
	}

	baseConfig := &xray.Config{}
	if err := json.Unmarshal([]byte(templateConfig), baseConfig); err != nil {
		return err
	}

	// Group inbounds by their assigned nodes
	for _, inbound := range allInbounds {
		if !inbound.Enable {
			continue
		}

		nodesForIB, err := s.nodeService.GetNodesForInbound(inbound.Id)
		if err != nil || len(nodesForIB) == 0 {
			logger.Debugf("Inbound %d is not assigned to any node, skipping", inbound.Id)
			continue
		}

		for _, n := range nodesForIB {
			nodeInbounds[n.Id] = append(nodeInbounds[n.Id], inbound)
		}
	}

	hyCert, _ := s.settingService.GetCertFile()
	hyKey, _ := s.settingService.GetKeyFile()

	// Send config to each node in parallel for better performance
	var wg sync.WaitGroup
	var mu sync.Mutex
	var errors []error

	// Send configs to all nodes in parallel
	for _, node := range nodes {
		if !node.Enable {
			continue
		}
		inbounds, ok := nodeInbounds[node.Id]
		if !ok {
			// No inbounds assigned to this node, skip
			continue
		}

		wg.Add(1)
		go func(n *model.Node, ibs []*model.Inbound) {
			defer wg.Done()

			configJSON, err := s.buildNodeWorkerConfigJSON(n, ibs, baseConfig, hyCert, hyKey)
			if err != nil {
				logger.Errorf("[Node: %s] Failed to marshal config: %v", n.Name, err)
				mu.Lock()
				errors = append(errors, fmt.Errorf("node %s: failed to marshal config: %w", n.Name, err))
				mu.Unlock()
				return
			}

			if err := s.nodeService.ApplyConfigToNode(n, configJSON); err != nil {
				logger.Errorf("[Node: %s] Failed to apply config: %v", n.Name, err)
				mu.Lock()
				errors = append(errors, fmt.Errorf("node %s: %w", n.Name, err))
				mu.Unlock()
			} else {
				logger.Infof("[Node: %s] Successfully applied config", n.Name)
			}
		}(node, inbounds)
	}

	// Wait for all goroutines to complete
	wg.Wait()

	// Log summary
	if len(errors) > 0 {
		logger.Warningf("Failed to apply config to %d node(s) out of %d", len(errors), len(nodes))
		for _, err := range errors {
			logger.Warningf("  - %v", err)
		}
		// Return error only if all nodes failed
		if len(errors) == len(nodes) {
			return fmt.Errorf("failed to apply config to all nodes: %d errors", len(errors))
		}
	} else {
		logger.Infof("Successfully applied config to all %d node(s)", len(nodes))
	}

	return nil
}

// EnsureXrayConfigFile generates and saves the Xray configuration file from database.
// This ensures the config file is ready before Xray starts, even if Xray is not yet running.
// The configuration is built from xrayTemplateConfig in database and current inbounds.
func (s *XrayService) EnsureXrayConfigFile() error {
	// Ensure template config is valid in DB
	if err := s.settingService.EnsureXrayTemplateConfigValid(); err != nil {
		logger.Warningf("Failed to ensure xrayTemplateConfig is valid in EnsureXrayConfigFile: %v", err)
		// Continue; GetXrayConfig may still succeed.
	}

	cfg, err := s.GetXrayConfig()
	if err != nil {
		return err
	}

	if _, err := xray.WriteConfigFile(cfg); err != nil {
		return err
	}

	logger.Info("Xray configuration file pre-generated from database")
	return nil
}

// StopXray stops the running Xray process.
func (s *XrayService) StopXray() error {
	lock.Lock()
	defer lock.Unlock()
	isManuallyStopped.Store(true)
	logger.Debug("Attempting to stop Xray...")
	if s.IsXrayRunning() {
		// Close API connections before stopping Xray
		s.CloseAPIConnections()
		return p.Stop()
	}
	// Xray is not running, nothing to stop - this is not an error
	logger.Debug("Xray is not running, nothing to stop")
	return nil
}

// SetToNeedRestart marks that Xray needs to be restarted.
func (s *XrayService) SetToNeedRestart() {
	isNeedXrayRestart.Store(true)
}

// IsNeedRestartAndSetFalse checks if restart is needed and resets the flag to false.
func (s *XrayService) IsNeedRestartAndSetFalse() bool {
	return isNeedXrayRestart.CompareAndSwap(true, false)
}

// DidXrayCrash checks if Xray crashed by verifying it's not running and wasn't manually stopped.
func (s *XrayService) DidXrayCrash() bool {
	return !s.IsXrayRunning() && !isManuallyStopped.Load()
}
