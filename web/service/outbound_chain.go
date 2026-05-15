// Phase 4 — cascade chain CRUD service.
//
// Compiles each enabled OutboundChain to an Xray routing.balancers entry.
// Per-member observatory probing is left to Xray (observatory.subjectSelector
// matches member tags); the chain row carries probe URL + interval that we
// merge into the global observatory block at Xray-config-render time.
//
// Build path (BuildBalancerJSON / merging into BuildXrayConfig) lives in a
// follow-up commit — this file is the data layer + member reordering helper.
//
// See .agent/plans/phase-4-cascade.md.
package service

import (
	"errors"
	"fmt"
	"strings"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
	"gorm.io/gorm"
)

// OutboundChainService manages OutboundChain CRUD + member assignments.
type OutboundChainService struct{}

// SupportedChainStrategies lists every strategy the chain compiler emits.
var SupportedChainStrategies = []string{"leastPing", "random", "priority"}

func isSupportedStrategy(s string) bool {
	for _, x := range SupportedChainStrategies {
		if x == strings.TrimSpace(s) {
			return true
		}
	}
	return false
}

// List returns all chains with their members preloaded.
func (s *OutboundChainService) List() ([]*model.OutboundChain, error) {
	var rows []*model.OutboundChain
	if err := database.GetDB().
		Preload("Members", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		Order("id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// Get one chain by id (with members).
func (s *OutboundChainService) Get(id int) (*model.OutboundChain, error) {
	var ch model.OutboundChain
	if err := database.GetDB().
		Preload("Members", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order ASC, id ASC")
		}).
		First(&ch, id).Error; err != nil {
		return nil, err
	}
	return &ch, nil
}

// Create persists a chain + initial member list. Tags must be non-empty;
// duplicate tags within the same chain are dropped silently.
func (s *OutboundChainService) Create(ch *model.OutboundChain) error {
	if ch == nil {
		return errors.New("nil chain")
	}
	if strings.TrimSpace(ch.Name) == "" {
		return errors.New("name is required")
	}
	if ch.Strategy == "" {
		ch.Strategy = "leastPing"
	}
	if !isSupportedStrategy(ch.Strategy) {
		return fmt.Errorf("unsupported strategy %q (want one of %v)", ch.Strategy, SupportedChainStrategies)
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		members := ch.Members
		ch.Members = nil
		if err := tx.Create(ch).Error; err != nil {
			return err
		}
		return s.replaceMembersTx(tx, ch.Id, members)
	})
}

// Update writes top-level fields and replaces the member set wholesale.
func (s *OutboundChainService) Update(ch *model.OutboundChain) error {
	if ch == nil || ch.Id <= 0 {
		return errors.New("invalid chain id")
	}
	if !isSupportedStrategy(ch.Strategy) {
		return fmt.Errorf("unsupported strategy %q", ch.Strategy)
	}
	return database.GetDB().Transaction(func(tx *gorm.DB) error {
		patch := map[string]any{
			"name":                   ch.Name,
			"strategy":               ch.Strategy,
			"probe_url":              ch.ProbeURL,
			"probe_interval_seconds": ch.ProbeIntervalSeconds,
			"enable":                 ch.Enable,
		}
		if err := tx.Model(&model.OutboundChain{}).Where("id = ?", ch.Id).Updates(patch).Error; err != nil {
			return err
		}
		return s.replaceMembersTx(tx, ch.Id, ch.Members)
	})
}

// Delete drops the chain (members cascade via FK).
func (s *OutboundChainService) Delete(id int) error {
	return database.GetDB().Delete(&model.OutboundChain{}, id).Error
}

func (s *OutboundChainService) replaceMembersTx(tx *gorm.DB, chainID int, members []model.OutboundChainMember) error {
	if err := tx.Where("chain_id = ?", chainID).Delete(&model.OutboundChainMember{}).Error; err != nil {
		return err
	}
	if len(members) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(members))
	rows := make([]model.OutboundChainMember, 0, len(members))
	for i, m := range members {
		tag := strings.TrimSpace(m.OutboundTag)
		if tag == "" {
			continue
		}
		if _, dup := seen[tag]; dup {
			continue
		}
		seen[tag] = struct{}{}
		rows = append(rows, model.OutboundChainMember{
			ChainId:     chainID,
			OutboundTag: tag,
			SortOrder:   i,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return tx.Create(&rows).Error
}
