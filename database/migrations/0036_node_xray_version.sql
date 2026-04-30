-- Cached worker Xray version string for Nodes page/UI (e.g. "26.4.17").
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS xray_version TEXT NOT NULL DEFAULT '';
