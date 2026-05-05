-- Host-level overrides merged into subscription share links when an enabled host is mapped to the inbound.
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_sni VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_http_host VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_path VARCHAR(1024) NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_alpn VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_fp VARCHAR(128) NOT NULL DEFAULT '';
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_allow_insecure BOOLEAN NULL;
