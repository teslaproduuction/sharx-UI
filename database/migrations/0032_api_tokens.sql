-- API access tokens (JWT) for panel REST API without session cookies.
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    jti VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    last_used_at BIGINT,
    revoked_at BIGINT,
    CONSTRAINT uq_api_tokens_jti UNIQUE (jti)
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id ON api_tokens(user_id);
