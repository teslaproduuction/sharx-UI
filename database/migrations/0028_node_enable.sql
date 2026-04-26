-- When disabled, the panel does not health-check, collect stats, or push Xray config to the node.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS enable INTEGER NOT NULL DEFAULT 1;
