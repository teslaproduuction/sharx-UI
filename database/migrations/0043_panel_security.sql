-- Phase 1 — Caddy panel masking + Hiddify-style decoy.
-- See .agent/plans/phase-1-caddy-masking.md for full context.
--
-- Settings entries are managed by web/service/setting.go via the key/value `settings` table,
-- which already exists. This migration only seeds the new keys with defaults if they are missing,
-- so existing installations pick them up safely.
--
-- panelSecretPrefix          random b64url 16-byte path prefix that hides the panel UI.
--                            Empty default means: panel is reachable on the root path until the
--                            install script generates a real value.
-- panelDecoyURL              upstream URL the Caddy front-door reverse-proxies all unrecognized
--                            paths to (Hiddify-style transparent decoy). Default https://example.com.
-- panelMascaraedAfterHours   delay before the root '/' also routes to the decoy. Default 1.
-- panelInstallTime           unix epoch seconds when the panel was first launched (for the
--                            mascaraed countdown). Set lazily by the panel on first boot.
-- caddyAdminURL              endpoint to push Caddy reload requests via its admin API.

INSERT INTO settings (key, value)
SELECT 'panelSecretPrefix', ''
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'panelSecretPrefix');

INSERT INTO settings (key, value)
SELECT 'panelDecoyURL', 'https://example.com'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'panelDecoyURL');

INSERT INTO settings (key, value)
SELECT 'panelMascaraedAfterHours', '1'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'panelMascaraedAfterHours');

INSERT INTO settings (key, value)
SELECT 'panelInstallTime', ''
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'panelInstallTime');

INSERT INTO settings (key, value)
SELECT 'caddyAdminURL', 'http://127.0.0.1:2019'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'caddyAdminURL');
