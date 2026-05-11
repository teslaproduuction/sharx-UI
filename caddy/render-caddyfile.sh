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

# Pick site address + tls block based on whether a domain was provided.
# With domain → ACME Let's Encrypt; without → :443 listen + Caddy internal CA self-signed.
if [ -n "$PANEL_DOMAIN" ]; then
    SITE_ADDRESS="$PANEL_DOMAIN"
    TLS_BLOCK="tls { issuer acme }"
    GLOBAL_EMAIL="email admin@${PANEL_DOMAIN}"
else
    SITE_ADDRESS=":443"
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
