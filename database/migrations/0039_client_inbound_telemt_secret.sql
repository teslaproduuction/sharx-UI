-- Per-mapping secret for Telemt (MTProto) inbounds; 32 hex chars, nullable.
ALTER TABLE client_inbound_mappings ADD COLUMN IF NOT EXISTS telemt_secret VARCHAR(32) NULL;
