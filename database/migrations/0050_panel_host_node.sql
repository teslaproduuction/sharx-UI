-- Pre-seed the panel-host pseudo-node as a real row (id = 0) so it flows
-- through the normal node machinery — inbound/sidecar bindings, per-node config
-- build (GetInboundsForNode / GetNodesForInbound / InboundsForWorkerNode) — when
-- the operator enables hybrid "panel runs a local node" mode
-- (settings.panelHostWorkload).
--
-- Explicit id = 0 never collides with the SERIAL sequence (nextval starts at 1).
-- enable = false keeps the panel-host out of the worker health-check / HTTP push
-- loops (those skip id <= 0 and disabled nodes); local workload is driven by the
-- panelHostWorkload setting and applied in-process, never pushed over the wire.
-- address = 'local' is a sentinel: ApplyConfigToNode never targets id = 0.
INSERT INTO nodes (id, name, address, api_key, status, enable)
VALUES (0, 'panel-host', 'local', '', 'active', false)
ON CONFLICT (id) DO NOTHING;
