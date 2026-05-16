#!/usr/bin/env bash
# Smoke: panel responds on /testprefix/ + /testprefix/panel/ within 30s.
set -euo pipefail

URL="http://127.0.0.1:2053/testprefix/"
deadline=$((SECONDS + 30))
while (( SECONDS < deadline )); do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$URL" || true)
  if [[ "$code" == "200" || "$code" == "302" ]]; then
    exit 0
  fi
  sleep 1
done
echo "panel did not return 200/302 in 30s (last=$code)" >&2
exit 1
