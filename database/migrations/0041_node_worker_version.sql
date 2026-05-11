-- Cached SharX worker (node binary) version from GET /api/v1/status (sharxVersion), empty when unknown.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS worker_version TEXT NOT NULL DEFAULT '';
