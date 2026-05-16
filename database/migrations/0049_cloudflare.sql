-- Phase 7 — Cloudflare integration scaffold (Hiddify-pattern).
--
-- cloudflare_credentials  : encrypted CF API tokens (one per account).
-- cloudflare_zones        : zones discovered via CF API for the credential set.
-- cloudflare_domains      : panel-managed domains routed through CF in one of
--                           4 modes (direct / cdn / worker / auto_cdn_ip).
--
-- Worker script content lives in web/cloudflare/worker.js (static repo asset);
-- worker_script_id stores the deployment id returned by CF Workers Scripts API.
--
-- See .agent/plans/phase-7-cloudflare.md.

CREATE TABLE IF NOT EXISTS cloudflare_credentials (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER     NOT NULL DEFAULT 1,
    name         VARCHAR(64) NOT NULL UNIQUE,
    api_token    TEXT        NOT NULL,                          -- AES-GCM encrypted
    account_id   VARCHAR(64),                                   -- discovered via /accounts
    scope_summary TEXT,                                         -- JSON: {zones:[…], workers:bool, dns:bool}
    last_verified BIGINT     NOT NULL DEFAULT 0,
    created_at   BIGINT      NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cloudflare_zones (
    id              SERIAL PRIMARY KEY,
    credential_id   INTEGER     NOT NULL REFERENCES cloudflare_credentials(id) ON DELETE CASCADE,
    cf_zone_id      VARCHAR(64) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    status          VARCHAR(32),
    created_at      BIGINT      NOT NULL DEFAULT 0,
    UNIQUE (credential_id, cf_zone_id)
);

CREATE TABLE IF NOT EXISTS cloudflare_domains (
    id                SERIAL PRIMARY KEY,
    credential_id     INTEGER     NOT NULL REFERENCES cloudflare_credentials(id) ON DELETE CASCADE,
    zone_id           INTEGER     REFERENCES cloudflare_zones(id) ON DELETE SET NULL,
    name              VARCHAR(255) NOT NULL UNIQUE,
    -- direct      : A → server IP, CF proxy off
    -- cdn         : A → server IP, CF proxy on (orange cloud)
    -- worker      : domain → CF Worker → relay → origin (auto-deploy worker script)
    -- auto_cdn_ip : rotation through curated clean CF IPs
    mode              VARCHAR(32) NOT NULL DEFAULT 'direct',
    status            VARCHAR(32) NOT NULL DEFAULT 'pending',
    origin_ip         VARCHAR(64),
    worker_script_id  VARCHAR(128),
    last_synced       BIGINT      NOT NULL DEFAULT 0,
    created_at        BIGINT      NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cf_domains_mode   ON cloudflare_domains (mode);
CREATE INDEX IF NOT EXISTS idx_cf_domains_status ON cloudflare_domains (status);
