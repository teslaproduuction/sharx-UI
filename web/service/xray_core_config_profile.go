package service

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"github.com/konstpic/sharx-code/v2/logger"
	"github.com/konstpic/sharx-code/v2/util/common"
	"github.com/konstpic/sharx-code/v2/xray"

	"gorm.io/gorm"
)

// XrayCoreConfigProfileService provides business logic for managing Xray core configuration profiles.
type XrayCoreConfigProfileService struct{}

func coreConfigContentHash(configJSON string) string {
	if configJSON == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(configJSON))
	return hex.EncodeToString(sum[:])
}

func attachCoreProfileHash(p *model.XrayCoreConfigProfile) {
	if p == nil {
		return
	}
	p.ConfigHash = coreConfigContentHash(p.ConfigJson)
}

// GetProfile retrieves a profile by ID.
func (s *XrayCoreConfigProfileService) GetProfile(id int) (*model.XrayCoreConfigProfile, error) {
	db := database.GetDB()
	var profile model.XrayCoreConfigProfile
	err := db.Where("id = ?", id).First(&profile).Error
	if err != nil {
		return nil, err
	}
	// Load node IDs
	nodeIds, err := s.GetNodesForProfile(profile.Id)
	if err == nil {
		profile.NodeIds = nodeIds
	}
	attachCoreProfileHash(&profile)
	return &profile, nil
}

// GetNodesForProfile retrieves all node IDs assigned to a profile.
func (s *XrayCoreConfigProfileService) GetNodesForProfile(profileId int) ([]int, error) {
	db := database.GetDB()
	var mappings []model.ProfileNodeMapping
	err := db.Where("profile_id = ?", profileId).Find(&mappings).Error
	if err != nil {
		return nil, err
	}
	nodeIds := make([]int, len(mappings))
	for i, mapping := range mappings {
		nodeIds[i] = mapping.NodeId
	}
	return nodeIds, nil
}

// GetProfilesForNode retrieves all profiles assigned to a node.
func (s *XrayCoreConfigProfileService) GetProfilesForNode(nodeId int) ([]*model.XrayCoreConfigProfile, error) {
	db := database.GetDB()
	var mappings []model.ProfileNodeMapping
	err := db.Where("node_id = ?", nodeId).Find(&mappings).Error
	if err != nil {
		return nil, err
	}

	if len(mappings) == 0 {
		return []*model.XrayCoreConfigProfile{}, nil
	}

	profileIds := make([]int, len(mappings))
	for i, mapping := range mappings {
		profileIds[i] = mapping.ProfileId
	}

	var profiles []*model.XrayCoreConfigProfile
	err = db.Where("id IN ?", profileIds).Find(&profiles).Error
	if err != nil {
		return nil, err
	}

	for i := range profiles {
		attachCoreProfileHash(profiles[i])
	}
	return profiles, nil
}

// GetAllProfiles retrieves all profiles for a user.
func (s *XrayCoreConfigProfileService) GetAllProfiles(userId int) ([]*model.XrayCoreConfigProfile, error) {
	db := database.GetDB()
	var profiles []*model.XrayCoreConfigProfile
	err := db.Where("user_id = ?", userId).Order("is_default DESC, created_at ASC").Find(&profiles).Error
	if err != nil {
		return nil, err
	}
	// Load node IDs for each profile
	for _, profile := range profiles {
		nodeIds, err := s.GetNodesForProfile(profile.Id)
		if err == nil {
			profile.NodeIds = nodeIds
		}
		attachCoreProfileHash(profile)
	}
	return profiles, nil
}

// GetDefaultProfile retrieves the default profile for a user.
func (s *XrayCoreConfigProfileService) GetDefaultProfile(userId int) (*model.XrayCoreConfigProfile, error) {
	db := database.GetDB()
	var profile model.XrayCoreConfigProfile
	err := db.Where("user_id = ? AND is_default = ?", userId, true).First(&profile).Error
	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // No default profile found
		}
		return nil, err
	}
	return &profile, nil
}

// AddProfile creates a new profile.
func (s *XrayCoreConfigProfileService) AddProfile(profile *model.XrayCoreConfigProfile) (*model.XrayCoreConfigProfile, error) {
	// Validate JSON config
	if err := s.validateConfigJson(profile.ConfigJson); err != nil {
		return nil, common.NewErrorf("invalid Xray config JSON: %v", err)
	}

	db := database.GetDB()

	// If this is set as default, unset other default profiles for this user
	if profile.IsDefault {
		err := db.Model(&model.XrayCoreConfigProfile{}).
			Where("user_id = ? AND is_default = ?", profile.UserId, true).
			Update("is_default", false).Error
		if err != nil {
			return nil, err
		}
	}

	err := db.Create(profile).Error
	if err != nil {
		return nil, err
	}

	logger.Infof("Xray core config profile %d created for user %d", profile.Id, profile.UserId)
	attachCoreProfileHash(profile)
	return profile, nil
}

// UpdateProfile updates an existing profile.
func (s *XrayCoreConfigProfileService) UpdateProfile(profile *model.XrayCoreConfigProfile) (*model.XrayCoreConfigProfile, error) {
	// Validate JSON config if provided
	if profile.ConfigJson != "" {
		if err := s.validateConfigJson(profile.ConfigJson); err != nil {
			return nil, common.NewErrorf("invalid Xray config JSON: %v", err)
		}
	}

	db := database.GetDB()

	// If this is set as default, unset other default profiles for this user
	if profile.IsDefault {
		err := db.Model(&model.XrayCoreConfigProfile{}).
			Where("user_id = ? AND is_default = ? AND id != ?", profile.UserId, true, profile.Id).
			Update("is_default", false).Error
		if err != nil {
			return nil, err
		}
	}

	err := db.Model(&model.XrayCoreConfigProfile{}).Where("id = ?", profile.Id).Updates(profile).Error
	if err != nil {
		return nil, err
	}

	// Reload to get updated data
	return s.GetProfile(profile.Id)
}

// DeleteProfile deletes a profile by ID.
func (s *XrayCoreConfigProfileService) DeleteProfile(id int) error {
	db := database.GetDB()

	// Check if profile is used by any outbounds
	var count int64
	err := db.Model(&model.Outbound{}).Where("core_config_profile_id = ?", id).Count(&count).Error
	if err != nil {
		return err
	}
	if count > 0 {
		return common.NewErrorf("cannot delete profile: it is used by %d outbound(s)", count)
	}

	// Check if this is the default profile
	var profile model.XrayCoreConfigProfile
	err = db.Where("id = ?", id).First(&profile).Error
	if err != nil {
		return err
	}
	if profile.IsDefault {
		return common.NewError("cannot delete the default profile")
	}

	err = db.Delete(&model.XrayCoreConfigProfile{}, id).Error
	if err != nil {
		return err
	}

	logger.Infof("Xray core config profile %d deleted", id)
	return nil
}

// SetAsDefault sets a profile as the default for a user.
func (s *XrayCoreConfigProfileService) SetAsDefault(id int, userId int) error {
	db := database.GetDB()

	// Unset all other default profiles for this user
	err := db.Model(&model.XrayCoreConfigProfile{}).
		Where("user_id = ? AND is_default = ?", userId, true).
		Update("is_default", false).Error
	if err != nil {
		return err
	}

	// Set this profile as default
	err = db.Model(&model.XrayCoreConfigProfile{}).
		Where("id = ? AND user_id = ?", id, userId).
		Update("is_default", true).Error
	if err != nil {
		return err
	}

	logger.Infof("Xray core config profile %d set as default for user %d", id, userId)
	return nil
}

// CreateDefaultProfileFromTemplate creates a default profile from the current xrayTemplateConfig.
func (s *XrayCoreConfigProfileService) CreateDefaultProfileFromTemplate(userId int) (*model.XrayCoreConfigProfile, error) {
	settingService := SettingService{}
	templateConfig, err := settingService.GetXrayConfigTemplate()
	if err != nil {
		return nil, common.NewErrorf("failed to get Xray template config: %v", err)
	}

	// Validate the template config
	if err := s.validateConfigJson(templateConfig); err != nil {
		return nil, common.NewErrorf("invalid Xray template config: %v", err)
	}

	profile := &model.XrayCoreConfigProfile{
		UserId:      userId,
		Name:        "Default",
		Description: "Default Xray core configuration profile created from template",
		ConfigJson:  templateConfig,
		IsDefault:   true,
	}

	return s.AddProfile(profile)
}

// ResetToDefault resets a profile to the default template configuration.
func (s *XrayCoreConfigProfileService) ResetToDefault(id int) (*model.XrayCoreConfigProfile, error) {
	profile, err := s.GetProfile(id)
	if err != nil {
		return nil, err
	}

	settingService := SettingService{}
	templateConfig, err := settingService.GetXrayConfigTemplate()
	if err != nil {
		return nil, common.NewErrorf("failed to get Xray template config: %v", err)
	}

	// Validate the template config
	if err := s.validateConfigJson(templateConfig); err != nil {
		return nil, common.NewErrorf("invalid Xray template config: %v", err)
	}

	profile.ConfigJson = templateConfig
	return s.UpdateProfile(profile)
}

// validateConfigJson validates that the JSON string is a valid Xray configuration.
func (s *XrayCoreConfigProfileService) validateConfigJson(configJson string) error {
	if configJson == "" {
		return common.NewError("config JSON cannot be empty")
	}

	xrayConfig := &xray.Config{}
	err := json.Unmarshal([]byte(configJson), xrayConfig)
	if err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	return nil
}

// EnsureDefaultProfile ensures that a default profile exists for a user.
// If no default profile exists, creates one from the template.
func (s *XrayCoreConfigProfileService) EnsureDefaultProfile(userId int) (*model.XrayCoreConfigProfile, error) {
	defaultProfile, err := s.GetDefaultProfile(userId)
	if err != nil {
		return nil, err
	}

	if defaultProfile != nil {
		return defaultProfile, nil
	}

	// No default profile exists, create one
	return s.CreateDefaultProfileFromTemplate(userId)
}

// AssignProfileToNodes assigns a profile to multiple nodes.
// Nodes that were bound to another profile are unbound first, then this profile's
// node list is replaced by nodeIds (same as before: clears previous assignments for the profile).
func (s *XrayCoreConfigProfileService) AssignProfileToNodes(profileId int, nodeIds []int) error {
	if len(nodeIds) == 0 {
		// Remove all assignments if no nodes provided
		db := database.GetDB()
		return db.Where("profile_id = ?", profileId).Delete(&model.ProfileNodeMapping{}).Error
	}

	db := database.GetDB()
	// One node maps to at most one profile: remove these nodes from whichever profile they had.
	if err := db.Where("node_id IN ?", nodeIds).Delete(&model.ProfileNodeMapping{}).Error; err != nil {
		return err
	}
	// Remove all existing assignments for this profile, then add the new set.
	if err := db.Where("profile_id = ?", profileId).Delete(&model.ProfileNodeMapping{}).Error; err != nil {
		return err
	}
	// Then, add new assignments
	mappings := make([]model.ProfileNodeMapping, len(nodeIds))
	for i, nodeId := range nodeIds {
		mappings[i] = model.ProfileNodeMapping{
			ProfileId: profileId,
			NodeId:    nodeId,
		}
	}
	if err := db.Create(&mappings).Error; err != nil {
		return err
	}
	return nil
}

// GetNodeIDsWithProfileAssignment returns node IDs that have at least one core config profile mapping.
func (s *XrayCoreConfigProfileService) GetNodeIDsWithProfileAssignment() (map[int]struct{}, error) {
	db := database.GetDB()
	var nodeIds []int
	err := db.Model(&model.ProfileNodeMapping{}).Distinct("node_id").Pluck("node_id", &nodeIds).Error
	if err != nil {
		return nil, err
	}
	out := make(map[int]struct{}, len(nodeIds))
	for _, id := range nodeIds {
		out[id] = struct{}{}
	}
	return out, nil
}
