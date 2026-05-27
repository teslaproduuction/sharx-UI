-- Per-client concurrent unique IP limit (separate from HWID device limit).

ALTER TABLE client_entities ADD COLUMN IF NOT EXISTS ip_limit_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE client_entities ADD COLUMN IF NOT EXISTS max_ips INTEGER NOT NULL DEFAULT 1;
