-- Cached worker Xray version string for Nodes page/UI (e.g. "26.5.3").
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS xray_version TEXT NOT NULL DEFAULT '';
