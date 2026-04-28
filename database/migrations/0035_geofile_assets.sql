CREATE TABLE IF NOT EXISTS geofile_assets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    file_type VARCHAR(32) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    source_url TEXT NOT NULL DEFAULT '',
    file_path TEXT NOT NULL UNIQUE,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    sha256 VARCHAR(64) NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_geofile_assets_user_id ON geofile_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_geofile_assets_file_type ON geofile_assets(file_type);
CREATE INDEX IF NOT EXISTS idx_geofile_assets_is_active ON geofile_assets(is_active);
