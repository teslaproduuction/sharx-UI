-- Phase 3 Part B — Cloudflare WARP egress accounts.
--
-- Each row is one anonymous WARP registration done via api.cloudflareclient.com/v0a4005/reg.
-- We store the keypair + assigned WARP IPs + peer endpoint + reserved bytes
-- exactly as Xray's native `wireguard` outbound expects them, so an Xray
-- outbound row tagged "warp-<name>" can be auto-rendered from this table.
--
-- Sensitive fields (private_key, license_key, access_token) are encrypted
-- with the same panel-secret-derived AES-GCM key used for CF API tokens
-- (util/crypto/aesgcm).
--
-- See .agent/protocols/warp.md.

CREATE TABLE IF NOT EXISTS warp_accounts (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER     NOT NULL DEFAULT 1,
    name            VARCHAR(64) NOT NULL UNIQUE,
    device_id       VARCHAR(64) NOT NULL,
    account_id      VARCHAR(64) NOT NULL,
    private_key     TEXT        NOT NULL,
    public_key      TEXT        NOT NULL,
    license_key     TEXT,
    is_plus         BOOLEAN     NOT NULL DEFAULT FALSE,
    ipv4_address    VARCHAR(64) NOT NULL,
    ipv6_address    VARCHAR(128),
    peer_endpoint   VARCHAR(255) NOT NULL DEFAULT 'engage.cloudflareclient.com:2408',
    peer_public_key VARCHAR(64) NOT NULL,
    reserved        BYTEA,
    access_token    TEXT,
    outbound_id     INTEGER,
    created_at      BIGINT      NOT NULL DEFAULT 0,
    refreshed_at    BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_warp_accounts_name ON warp_accounts (name);
