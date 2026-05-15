-- Phase 2 — sing-box (hiddify fork) singleton sidecar.
-- See .agent/plans/phase-2-singbox-inbound.md.
--
-- Adds:
--   nodes.singbox_state            mirrors nodes.telemt_state for the new singleton sidecar
--                                  (running | stopped | unknown). Reported by node /status.
--   nodes.singbox_config_hash      sha256 of the last-applied aggregated sing-box config JSON,
--                                  used to skip no-op SIGHUPs when the panel re-pushes
--                                  identical config.
--   singbox_pending_changes        batch-reload queue. Each row = 1 deferred config rewrite that
--                                  will trigger a SIGHUP (which kills active connections — see
--                                  sing-box issue #3731). Cron drains this queue every
--                                  SETTING.singbox_apply_interval_hours; UI 'Apply now' / disable-user
--                                  with 'Apply immediately' bypass the wait.

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS singbox_state       TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS singbox_config_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS singbox_pending_changes (
    id          SERIAL PRIMARY KEY,
    node_id     INTEGER REFERENCES nodes(id) ON DELETE CASCADE,    -- nullable: NULL = standalone (single-node)
    change_type TEXT    NOT NULL,                                  -- 'inbound_add' | 'inbound_update' | 'inbound_delete' | 'client_add' | 'client_update' | 'client_delete' | 'outbound_sidecar_change'
    payload     TEXT,                                              -- optional JSON describing the change (id refs, hashes — only for debug; the actual config is rebuilt from DB at apply time)
    created_at  BIGINT  NOT NULL DEFAULT 0,
    applied_at  BIGINT
);

CREATE INDEX IF NOT EXISTS idx_singbox_pending_changes_pending
    ON singbox_pending_changes (node_id, applied_at) WHERE applied_at IS NULL;
