-- Per-client blocked source IPs (session blocklist). Used to deny subscription from these IPs until removed.

CREATE TABLE IF NOT EXISTS client_blocked_session_ips (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    ip VARCHAR(255) NOT NULL,
    created_at BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_client_blocked_session_ip UNIQUE (client_id, ip)
);

CREATE INDEX IF NOT EXISTS idx_client_blocked_session_ips_client_id ON client_blocked_session_ips(client_id);
