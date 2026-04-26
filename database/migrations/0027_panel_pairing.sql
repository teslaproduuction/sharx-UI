-- Migration: Panel-wide SharX node pairing bundle
--
-- A single shared SECRET_KEY is generated once at panel startup and reused by every node.
-- Panel stores the full material locally so it can verify nodes via mTLS
-- and sign JWT tokens; nodes only receive the public half via SECRET_KEY env var.
--
-- Per-node columns kept on "nodes" table remain for backwards compatibility but are no
-- longer written by new flows.

CREATE TABLE IF NOT EXISTS panel_pairing (
    id                      INTEGER PRIMARY KEY,
    secret_key              TEXT NOT NULL,
    ca_cert_pem             TEXT NOT NULL,
    ca_key_pem              TEXT NOT NULL,
    node_cert_pem           TEXT NOT NULL,
    node_key_pem            TEXT NOT NULL,
    panel_client_cert_pem   TEXT NOT NULL,
    panel_client_key_pem    TEXT NOT NULL,
    jwt_private_key_pem     TEXT NOT NULL,
    jwt_public_key_pem      TEXT NOT NULL,
    created_at              BIGINT NOT NULL DEFAULT 0,
    updated_at              BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT panel_pairing_singleton CHECK (id = 1)
);
