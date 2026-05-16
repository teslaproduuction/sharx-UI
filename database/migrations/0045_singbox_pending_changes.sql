-- Phase 2 — sing-box batch reload queue.
--
-- DB schema is created by 0044_singbox_inbound_support.sql which already
-- contained the singbox_pending_changes definition. This file is kept as
-- a no-op for version-numbering continuity.
--
-- See web/service/singbox_pending.go and the model in database/model/model.go
-- (column `payload`, NOT `payload_json`; node_id is FK to nodes(id) with
-- NULL = standalone).

SELECT 1 WHERE FALSE;
