-- Phase 11 — SNI routing on :443. Per-inbound opt-in to be fronted by the Caddy
-- layer4 SNI router: clients connect to :443, Caddy peeks the TLS ClientHello
-- server_name and forwards (passthrough) to this inbound's real listen:port.
-- sni = the server_name that selects the inbound (empty → derived from its TLS
-- serverName). Lets VLESS/Trojan/AnyTLS (TCP) share :443 by SNI while Hysteria2/
-- TUIC (UDP) bind :443/udp independently.
ALTER TABLE inbounds ADD COLUMN IF NOT EXISTS share_tls_443 BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE inbounds ADD COLUMN IF NOT EXISTS sni VARCHAR(255) NOT NULL DEFAULT '';
