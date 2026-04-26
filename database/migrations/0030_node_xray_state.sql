-- Worker Xray process state as seen by the panel (running / stopped / error / unknown).
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS xray_state TEXT NOT NULL DEFAULT 'unknown';
