-- Rename client identifier column from email to name (immutable unique key per panel user).

ALTER TABLE client_entities RENAME COLUMN email TO name;

ALTER INDEX IF EXISTS idx_user_email RENAME TO idx_user_name;

ALTER TABLE inbound_client_ips RENAME COLUMN client_email TO client_name;
