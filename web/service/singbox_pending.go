// Phase 2 — sing-box batch reload queue.
//
// Records intent (CRUD on a sing-box-managed inbound or its assigned users)
// without forcing an immediate SIGHUP. The current default still applies
// immediately; this queue exists so the panel can later opt into off-hours
// batching (master-plan v3.2 compromise B) without rewriting every CRUD path.
//
// The queue is intentionally write-heavy and replay-blind: the Drain step
// rebuilds the entire aggregated sing-box config from the current DB state
// (BuildSingboxConfigStandalone / -ForNode), so we never need the payload to
// reconstruct a change — it is purely audit.
package service

import (
	"time"

	"github.com/konstpic/sharx-code/v2/database"
	"github.com/konstpic/sharx-code/v2/database/model"
)

// SingboxPendingService manages the singbox_pending_changes queue.
type SingboxPendingService struct{}

// Enqueue records one pending change. node_id may be 0 to signal a standalone
// (panel-host sing-box) change — Drain treats 0 as "the local sidecar".
func (s *SingboxPendingService) Enqueue(nodeID int, changeType string, payloadJSON string) error {
	if changeType == "" {
		return nil
	}
	row := model.SingboxPendingChange{
		NodeId:      nodeID,
		ChangeType:  changeType,
		PayloadJSON: payloadJSON,
		CreatedAt:   time.Now().UnixMilli(),
	}
	return database.GetDB().Create(&row).Error
}

// PendingCount returns the number of unapplied entries for a node (0 = standalone).
func (s *SingboxPendingService) PendingCount(nodeID int) (int64, error) {
	var n int64
	q := database.GetDB().Model(&model.SingboxPendingChange{}).Where("applied_at IS NULL")
	if nodeID > 0 {
		q = q.Where("node_id = ?", nodeID)
	} else {
		q = q.Where("node_id IS NULL OR node_id = 0")
	}
	err := q.Count(&n).Error
	return n, err
}

// MarkAllApplied stamps every pending row for the node as applied at the
// current time. Called after a successful Apply so the queue stays bounded.
func (s *SingboxPendingService) MarkAllApplied(nodeID int) error {
	now := time.Now().UnixMilli()
	q := database.GetDB().Model(&model.SingboxPendingChange{}).Where("applied_at IS NULL")
	if nodeID > 0 {
		q = q.Where("node_id = ?", nodeID)
	} else {
		q = q.Where("node_id IS NULL OR node_id = 0")
	}
	return q.Update("applied_at", now).Error
}
