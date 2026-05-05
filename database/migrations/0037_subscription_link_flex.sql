-- Host: how subscription addresses combine with multi-node addresses (replace | prepend | append).
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS subscription_apply_mode VARCHAR(32) NOT NULL DEFAULT 'replace';

-- Per inbound↔node: subscription order, published endpoint overrides, subscription visibility.
ALTER TABLE inbound_node_mappings ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inbound_node_mappings ADD COLUMN IF NOT EXISTS published_address VARCHAR(512) NOT NULL DEFAULT '';
ALTER TABLE inbound_node_mappings ADD COLUMN IF NOT EXISTS published_port INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inbound_node_mappings ADD COLUMN IF NOT EXISTS include_in_subscription BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE inbound_node_mappings ADD COLUMN IF NOT EXISTS subscription_remark_suffix VARCHAR(255) NOT NULL DEFAULT '';

-- Client↔inbound order in subscription output.
ALTER TABLE client_inbound_mappings ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
