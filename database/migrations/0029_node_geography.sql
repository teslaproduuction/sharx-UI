-- Approximate geolocation from IP (egress); updated on panel/node startup or push-geo.
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS geo_lat REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS geo_lng REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS geo_updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS geo_source TEXT;
