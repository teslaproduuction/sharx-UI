-- Migration: Hysteria / Hysteria2 inbound support
--
-- Schema note (no new columns required):
--   - Client shared secret is stored in client_entities.password (existing), mapped to Xray "auth".
--   - Inbound type uses inbounds.protocol = 'hysteria' or 'hysteria2' (existing VARCHAR column).
--   - Stream JSON (QUIC/TLS/masquerade/finalmask) stays in inbounds.stream_settings.
--
-- This migration adds an index to speed up queries that filter or join by protocol
-- (admin lists, subscription resolution, statistics).

CREATE INDEX IF NOT EXISTS idx_inbounds_protocol ON inbounds(protocol);
