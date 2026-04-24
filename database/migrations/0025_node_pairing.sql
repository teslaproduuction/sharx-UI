-- Migration: SharX node pairing (mTLS + JWT RS256)
-- Stores panel-side secrets; the node receives only SECRET_KEY (base64 JSON) once at creation.

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS auth_mode VARCHAR(32) NOT NULL DEFAULT 'legacy';
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS jwt_private_key_pem TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS panel_client_cert_pem TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS panel_client_key_pem TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS ca_cert_pem TEXT;
