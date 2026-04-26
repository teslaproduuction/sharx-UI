-- Normalize legacy auth_mode to pairing (SECRET_KEY + JWT + mTLS).
UPDATE nodes SET auth_mode = 'pairing' WHERE auth_mode = 'remna';
