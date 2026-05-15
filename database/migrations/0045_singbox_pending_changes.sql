-- Phase 2 — sing-box batch reload queue.
--
-- SIGHUP on hiddify-sing-box closes existing connections (sing-box #3731).
-- The default flow still applies changes immediately (preserves current
-- behavior); operators that want to coalesce CRUD into off-hours can flip
-- a future `singbox_apply_immediate` setting and process this queue on a
-- timer or via the manual /panel/api/singbox/apply-pending endpoint.
--
-- payload_json holds the change envelope (inbound id, before/after diff,
-- triggering user). We record but never replay it — the apply step rebuilds
-- the entire aggregated config from the current DB state, so the queue is
-- essentially a deduplication and audit log.

CREATE TABLE IF NOT EXISTS singbox_pending_changes (
    id          BIGSERIAL PRIMARY KEY,
    node_id     INTEGER NULL,
    change_type TEXT    NOT NULL,
    payload_json TEXT   NOT NULL DEFAULT '{}',
    created_at  BIGINT  NOT NULL,
    applied_at  BIGINT  NULL
);

CREATE INDEX IF NOT EXISTS idx_singbox_pending_node_pending
    ON singbox_pending_changes (node_id, applied_at)
    WHERE applied_at IS NULL;
