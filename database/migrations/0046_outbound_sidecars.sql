-- Phase 3 — sing-box client outbounds (cascade members).
--
-- One row per OutboundSidecar = one sing-box client (naive_client / anytls_client /
-- mieru_client / tuic_client / hy2_client) that lives in the same singleton
-- sing-box process as the Phase 2 inbounds. Each sidecar gets:
--   • a sing-box outbound section (kind + target server + auth + tls)
--   • a sing-box mixed inbound on 127.0.0.1:listen_port (the bridge)
--   • a sing-box route rule pinning bridge → outbound
--   • an Xray socks-out tagged "<name>-local" pointing at the bridge port
--     so RoutingBuilder rules can use the friendly tag.
--
-- See .agent/plans/phase-3-naive-outbound.md.

CREATE TABLE IF NOT EXISTS outbound_sidecars (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL DEFAULT 1,
    name        VARCHAR(64) NOT NULL UNIQUE,
    kind        VARCHAR(32) NOT NULL,
    config_json TEXT        NOT NULL DEFAULT '{}',
    listen_port INTEGER     NOT NULL,
    enable      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  BIGINT      NOT NULL DEFAULT 0,
    updated_at  BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outbound_sidecar_node_mappings (
    id         SERIAL PRIMARY KEY,
    sidecar_id INTEGER NOT NULL REFERENCES outbound_sidecars(id) ON DELETE CASCADE,
    node_id    INTEGER NOT NULL REFERENCES nodes(id)             ON DELETE CASCADE,
    UNIQUE (sidecar_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_sidecar_enabled
    ON outbound_sidecars (enable);
