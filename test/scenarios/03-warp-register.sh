#!/usr/bin/env bash
# Register a WARP account against the real CF API + verify the Xray outbound
# JSON renders cleanly (decryptable secretKey, peer endpoint normalized).
set -euo pipefail

PANEL="http://127.0.0.1:2053/testprefix"

cookie=$(mktemp)
trap 'rm -f "$cookie"' EXIT

curl -fsSL -c "$cookie" -X POST -H "Content-Type: application/json" \
  --data '{"username":"admin","password":"admin"}' \
  "$PANEL/login" >/dev/null

reg=$(curl -fsSL -b "$cookie" -X POST -H "Content-Type: application/json" \
  --data '{"name":"scenario-warp"}' \
  "$PANEL/panel/warp-account/register")
id=$(echo "$reg" | python3 -c 'import json,sys; print(json.load(sys.stdin)["obj"]["id"])')

json=$(curl -fsSL -b "$cookie" "$PANEL/panel/warp-account/outbound-json/$id" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["obj"]["json"])')

echo "$json" | python3 -c '
import json, sys
o = json.loads(sys.stdin.read())
assert o["protocol"] == "wireguard"
assert o["settings"]["peers"][0]["endpoint"].endswith(":2408")
assert o["settings"]["secretKey"]
print("OK", o["tag"])
'

curl -fsSL -b "$cookie" -X POST "$PANEL/panel/warp-account/del/$id" >/dev/null
