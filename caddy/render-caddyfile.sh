#!/bin/sh
# Render /etc/caddy/Caddyfile.template -> /etc/caddy/Caddyfile by substituting env vars.
# Validates required env are set before starting Caddy.
set -e

# PANEL_SECRET_PREFIX is mandatory; PANEL_DOMAIN is optional (fallback = IP-mode with self-signed TLS).
if [ -z "$PANEL_SECRET_PREFIX" ]; then
    echo "[caddy] FATAL: PANEL_SECRET_PREFIX is empty. Set it via docker-compose environment or .env file." >&2
    exit 1
fi

: "${PANEL_DECOY_URL:=https://example.com}"
: "${PANEL_BACKEND_HOST:=127.0.0.1}"
: "${PANEL_BACKEND_PORT:=2053}"
: "${SUB_BACKEND_PORT:=2096}"
: "${SNI_ROUTING_443:=false}"
: "${CADDY_HTTP_PORT:=8443}"

# Phase 11 — when the :443 SNI router is enabled, the Caddy HTTP server (panel +
# decoy) moves to an internal port (CADDY_HTTP_PORT); the panel pushes a caddy-l4
# server on :443 via the admin API that SNI-routes share_tls_443 inbounds and
# falls back to this HTTP server. With a domain, prefer DNS-01 ACME or a
# pre-provisioned cert — TLS-ALPN on :443 is owned by the l4 router.
HTTP_PORT_SUFFIX=""
if [ "$SNI_ROUTING_443" = "true" ]; then
    HTTP_PORT_SUFFIX=":${CADDY_HTTP_PORT}"
fi

# Pick site address + tls block based on whether a domain was provided.
# With domain → ACME Let's Encrypt; without → :443 listen + Caddy internal CA self-signed.
if [ -n "$PANEL_DOMAIN" ]; then
    SITE_ADDRESS="${PANEL_DOMAIN}${HTTP_PORT_SUFFIX}"
    # Multi-line block; Caddyfile rejects `tls { issuer acme }` on one line.
    TLS_BLOCK="$(printf 'tls {\n        issuer acme\n    }')"
    GLOBAL_EMAIL="email admin@${PANEL_DOMAIN}"
else
    if [ "$SNI_ROUTING_443" = "true" ]; then
        SITE_ADDRESS=":${CADDY_HTTP_PORT}"
    else
        SITE_ADDRESS=":443"
    fi
    TLS_BLOCK="tls internal"
    GLOBAL_EMAIL="# email omitted (no domain — using Caddy internal CA)"
    PANEL_DOMAIN="<ip-mode>"  # for log line below only
fi

export PANEL_DOMAIN PANEL_SECRET_PREFIX PANEL_DECOY_URL \
       PANEL_BACKEND_HOST PANEL_BACKEND_PORT SUB_BACKEND_PORT \
       SITE_ADDRESS TLS_BLOCK GLOBAL_EMAIL

envsubst '${SITE_ADDRESS} ${TLS_BLOCK} ${GLOBAL_EMAIL} ${PANEL_SECRET_PREFIX} ${PANEL_DECOY_URL} ${PANEL_BACKEND_HOST} ${PANEL_BACKEND_PORT} ${SUB_BACKEND_PORT}' \
    < /etc/caddy/Caddyfile.template \
    > /etc/caddy/Caddyfile

echo "[caddy] Rendered Caddyfile for ${PANEL_DOMAIN}, address=${SITE_ADDRESS}, secret-prefix=${PANEL_SECRET_PREFIX%${PANEL_SECRET_PREFIX#????}}*** decoy=${PANEL_DECOY_URL}"

exec "$@"
