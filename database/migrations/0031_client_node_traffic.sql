-- Per-node cumulative client traffic (bytes, Xray user>>> stats orientation).
-- Panel aggregates CollectNodeStats deltas; statistics matrix reads from this table.

CREATE TABLE IF NOT EXISTS client_node_traffics (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    up BIGINT NOT NULL DEFAULT 0,
    down BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_client_node_traffics_pair UNIQUE (client_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_client_node_traffics_client_id ON client_node_traffics(client_id);
CREATE INDEX IF NOT EXISTS idx_client_node_traffics_node_id ON client_node_traffics(node_id);
