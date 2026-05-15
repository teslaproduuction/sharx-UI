// Phase 3 — sing-box client outbounds (cascade members).
//
// Surfaces CRUD for the OutboundSidecar entity introduced by migration 0046.
// Build/apply (sing-box outbound + bridge inbound + Xray socks-out auto-creation)
// lands in subsequent commits — this file is the data layer + port allocator
// so the API/UI can take shape without touching the singbox config builder yet.
//
// See .agent/plans/phase-3-naive-outbound.md.
package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"gorm.io/gorm"
)

// OutboundSidecarService manages cascade-member sing-box client outbounds.
type OutboundSidecarService struct{}

// SupportedKinds lists every OutboundSidecar.kind the panel knows how to render.
// Kept in sync with web/service/singbox_<kind>.go builders (added per-kind).
var SupportedKinds = []string{
	"naive_client",
	"anytls_client",
	"mieru_client",
	"tuic_client",
	"hy2_client",
}

func isSupportedKind(k string) bool {
	for _, s := range SupportedKinds {
		if s == strings.TrimSpace(k) {
			return true
		}
	}
	return false
}

// List returns all sidecars for a user (user_id = 0 → all).
func (s *OutboundSidecarService) List(userID int) ([]*model.OutboundSidecar, error) {
	var rows []*model.OutboundSidecar
	q := database.GetDB().Model(&model.OutboundSidecar{}).Order("id ASC")
	if userID > 0 {
		q = q.Where("user_id = ?", userID)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	return s.attachNodeIds(rows)
}

func (s *OutboundSidecarService) attachNodeIds(rows []*model.OutboundSidecar) ([]*model.OutboundSidecar, error) {
	if len(rows) == 0 {
		return rows, nil
	}
	ids := make([]int, len(rows))
	for i, r := range rows {
		ids[i] = r.Id
	}
	var maps []model.OutboundSidecarNodeMapping
	if err := database.GetDB().Where("sidecar_id IN ?", ids).Find(&maps).Error; err != nil {
		return nil, err
	}
	byID := make(map[int][]int, len(rows))
	for _, m := range maps {
		byID[m.SidecarId] = append(byID[m.SidecarId], m.NodeId)
	}
	for _, r := range rows {
		r.NodeIds = byID[r.Id]
	}
	return rows, nil
}

// Get one sidecar by id (with NodeIds populated).
func (s *OutboundSidecarService) Get(id int) (*model.OutboundSidecar, error) {
	var sc model.OutboundSidecar
	if err := database.GetDB().First(&sc, id).Error; err != nil {
		return nil, err
	}
	rows, err := s.attachNodeIds([]*model.OutboundSidecar{&sc})
	if err != nil {
		return nil, err
	}
	return rows[0], nil
}

// Create persists a sidecar + its node assignments. listen_port is allocated
// when the supplied value is 0; otherwise the supplied port is used as-is.
func (s *OutboundSidecarService) Create(sc *model.OutboundSidecar) error {
	if sc == nil {
		return errors.New("nil sidecar")
	}
	if !isSupportedKind(sc.Kind) {
		return fmt.Errorf("unsupported kind %q (want one of %v)", sc.Kind, SupportedKinds)
	}
	if strings.TrimSpace(sc.Name) == "" {
		return errors.New("name is required")
	}
	if strings.TrimSpace(sc.ConfigJSON) == "" {
		sc.ConfigJSON = "{}"
	}
	if sc.ListenPort == 0 {
		port, err := s.AllocateLocalPort()
		if err != nil {
			return err
		}
		sc.ListenPort = port
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(sc).Error; err != nil {
			return err
		}
		return s.replaceNodeAssignmentsTx(tx, sc.Id, sc.NodeIds)
	})
}

// Update writes name/kind/config/listen_port/enable + reconciles node assignments.
func (s *OutboundSidecarService) Update(sc *model.OutboundSidecar) error {
	if sc == nil || sc.Id <= 0 {
		return errors.New("invalid sidecar id")
	}
	if !isSupportedKind(sc.Kind) {
		return fmt.Errorf("unsupported kind %q", sc.Kind)
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		patch := map[string]any{
			"name":        sc.Name,
			"kind":        sc.Kind,
			"config_json": sc.ConfigJSON,
			"listen_port": sc.ListenPort,
			"enable":      sc.Enable,
		}
		if err := tx.Model(&model.OutboundSidecar{}).Where("id = ?", sc.Id).Updates(patch).Error; err != nil {
			return err
		}
		return s.replaceNodeAssignmentsTx(tx, sc.Id, sc.NodeIds)
	})
}

// Delete drops the sidecar and its assignments (FK cascade).
func (s *OutboundSidecarService) Delete(id int) error {
	return database.GetDB().Delete(&model.OutboundSidecar{}, id).Error
}

func (s *OutboundSidecarService) replaceNodeAssignmentsTx(tx *gorm.DB, sidecarID int, nodeIDs []int) error {
	if err := tx.Where("sidecar_id = ?", sidecarID).Delete(&model.OutboundSidecarNodeMapping{}).Error; err != nil {
		return err
	}
	if len(nodeIDs) == 0 {
		return nil
	}
	rows := make([]model.OutboundSidecarNodeMapping, 0, len(nodeIDs))
	for _, nid := range nodeIDs {
		if nid <= 0 {
			continue
		}
		rows = append(rows, model.OutboundSidecarNodeMapping{SidecarId: sidecarID, NodeId: nid})
	}
	if len(rows) == 0 {
		return nil
	}
	return tx.Create(&rows).Error
}

// AllocateLocalPort returns the lowest unused port in 40000-49999 across all
// existing sidecars. Used when an admin omits listen_port from the create form.
func (s *OutboundSidecarService) AllocateLocalPort() (int, error) {
	var used []int
	if err := database.GetDB().Model(&model.OutboundSidecar{}).Pluck("listen_port", &used).Error; err != nil {
		return 0, err
	}
	taken := make(map[int]struct{}, len(used))
	for _, p := range used {
		taken[p] = struct{}{}
	}
	for p := 40000; p < 50000; p++ {
		if _, ok := taken[p]; !ok {
			return p, nil
		}
	}
	return 0, errors.New("no free port in 40000-49999 (all sidecars saturated)")
}
