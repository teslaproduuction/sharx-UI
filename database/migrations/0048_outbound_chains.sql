-- Phase 4 — cascade chains.
--
-- One OutboundChain row + N OutboundChainMember rows. Each chain compiles to an
-- Xray routing.balancers entry whose `selector` is the list of member outbound
-- tags (Phase 3 sidecars + Xray-native VLESS/Trojan/VMess outbounds + WARP
-- outbounds — the strategy decides which one wins per route).
--
-- See .agent/plans/phase-4-cascade.md.

CREATE TABLE IF NOT EXISTS outbound_chains (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER     NOT NULL DEFAULT 1,
    name        VARCHAR(64) NOT NULL UNIQUE,
    strategy    VARCHAR(32) NOT NULL DEFAULT 'leastPing', -- leastPing | random | priority
    probe_url   VARCHAR(255) NOT NULL DEFAULT 'https://www.google.com/generate_204',
    probe_interval_seconds INTEGER NOT NULL DEFAULT 60,
    enable      BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  BIGINT      NOT NULL DEFAULT 0,
    updated_at  BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS outbound_chain_members (
    id           SERIAL PRIMARY KEY,
    chain_id     INTEGER     NOT NULL REFERENCES outbound_chains(id) ON DELETE CASCADE,
    -- Free-form tag — could be a sidecar bridge ("toEU-local"), a native Xray
    -- outbound tag, or a WARP outbound tag ("warp-uk1"). The chain builder
    -- resolves the tag at config-render time.
    outbound_tag VARCHAR(128) NOT NULL,
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    UNIQUE (chain_id, outbound_tag)
);

CREATE INDEX IF NOT EXISTS idx_outbound_chains_enabled ON outbound_chains (enable);
CREATE INDEX IF NOT EXISTS idx_outbound_chain_members_chain ON outbound_chain_members (chain_id, sort_order);
