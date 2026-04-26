-- Subscription page builder configs (builder-driven SPA; external client compatibility)
CREATE TABLE IF NOT EXISTS subscription_page_configs (
    uuid VARCHAR(36) PRIMARY KEY,
    view_position INT NOT NULL DEFAULT 0,
    name VARCHAR(255) NOT NULL DEFAULT '',
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_subscription_page_configs_view_position ON subscription_page_configs (view_position);
