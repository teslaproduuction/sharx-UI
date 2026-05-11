#!/bin/sh
# Render /etc/caddy/Caddyfile.template -> /etc/caddy/Caddyfile by substituting env vars.
# Validates required env are set before starting Caddy.
set -e

REQUIRED="PANEL_DOMAIN PANEL_SECRET_PREFIX"
for v in $REQUIRED; do
    eval "val=\$$v"
    if [ -z "$val" ]; then
        echo "[caddy] FATAL: $v is empty. Set it via docker-compose environment or .env file." >&2
        exit 1
    fi
done

: "${PANEL_DECOY_URL:=https://example.com}"
: "${PANEL_BACKEND_HOST:=127.0.0.1}"
: "${PANEL_BACKEND_PORT:=2053}"
: "${SUB_BACKEND_PORT:=2096}"

export PANEL_DOMAIN PANEL_SECRET_PREFIX PANEL_DECOY_URL \
       PANEL_BACKEND_HOST PANEL_BACKEND_PORT SUB_BACKEND_PORT

envsubst '${PANEL_DOMAIN} ${PANEL_SECRET_PREFIX} ${PANEL_DECOY_URL} ${PANEL_BACKEND_HOST} ${PANEL_BACKEND_PORT} ${SUB_BACKEND_PORT}' \
    < /etc/caddy/Caddyfile.template \
    > /etc/caddy/Caddyfile

echo "[caddy] Rendered Caddyfile for ${PANEL_DOMAIN}, secret-prefix=${PANEL_SECRET_PREFIX:0:4}*** decoy=${PANEL_DECOY_URL}"

exec "$@"
