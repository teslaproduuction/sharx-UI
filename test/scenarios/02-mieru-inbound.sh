#!/usr/bin/env bash
# Provision a mieru inbound via panel API + verify the singleton sing-box
# binds the configured port within 15s.
set -euo pipefail

PANEL="http://127.0.0.1:2053/testprefix"

cookie=$(mktemp)
trap 'rm -f "$cookie"' EXIT

curl -fsSL -c "$cookie" -X POST -H "Content-Type: application/json" \
  --data '{"username":"admin","password":"admin"}' \
  "$PANEL/login" >/dev/null

body=$(cat <<'EOF'
{
  "remark": "scenario-mieru",
  "enable": true,
  "port": 31999,
  "protocol": "mieru",
  "settings": "{\"clients\":[{\"email\":\"scenario-user\",\"password\":\"scenario-pwd-32-bytes-of-entropy\"}],\"mtu\":1400,\"multiplexing\":\"MULTIPLEXING_LOW\",\"transport\":\"TCP\"}",
  "streamSettings": "{}",
  "sniffing": "{}",
  "total": 0,
  "expiryTime": 0,
  "trafficReset": "never",
  "up": 0,
  "down": 0
}
EOF
)
curl -fsSL -b "$cookie" -X POST -H "Content-Type: application/json" \
  --data-raw "$body" \
  "$PANEL/panel/api/inbounds/add" >/dev/null

deadline=$((SECONDS + 15))
while (( SECONDS < deadline )); do
  if docker compose exec -T panel ss -lnt 2>/dev/null | grep -q ":31999 "; then
    exit 0
  fi
  sleep 1
done
echo "sing-box did not bind :31999 in 15s" >&2
exit 1
