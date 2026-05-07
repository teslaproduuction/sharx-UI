-- Worker Telemt sidecar state as seen by the panel (running / stopped / unknown).
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS telemt_state TEXT NOT NULL DEFAULT 'unknown';
