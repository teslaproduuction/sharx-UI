-- Rename legacy auth_mode value from remna → pairing (same meaning: SECRET_KEY + JWT + mTLS).
UPDATE nodes SET auth_mode = 'pairing' WHERE auth_mode = 'remna';
