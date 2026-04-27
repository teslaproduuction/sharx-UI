#!/usr/bin/env bash
# Generate self-signed TLS (OpenSSL), write Xray server + client JSON (panel-style PEM arrays),
# print hysteria2:// link, run two local Xray cores and curl via client SOCKS.
#
# Usage: ./run-e2e.sh
# Env:   XRAY_BIN, HY2_PORT (default 29192), HY2_LISTEN (default 127.0.0.1), HY2_SNI (default vk.com)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_SCRIPTS="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKDIR="${SCRIPT_DIR}/out"
mkdir -p "$WORKDIR"

HY2_PORT="${HY2_PORT:-29192}"
HY2_LISTEN="${HY2_LISTEN:-127.0.0.1}"
HY2_SNI="${HY2_SNI:-vk.com}"
# First client secret (used in share link and curl test)
HY2_AUTH="${HY2_AUTH:-gYl9MWz0IPy32N05KyNlgviSwqc1dH6Y}"
HY2_AUTH2="${HY2_AUTH2:-KTMFc4s5AlYID3Cr4IsyBOxUkBxnOc5O}"
HY2_CURL_URL="${HY2_CURL_URL:-http://cp.cloudflare.com/generate_204}"
SOCKS_PORT="${SOCKS_PORT:-10809}"

XRAY_BIN="${XRAY_BIN:-}"
if [[ -z "$XRAY_BIN" ]] && command -v xray >/dev/null 2>&1; then
  XRAY_BIN="$(command -v xray)"
fi
if [[ -z "$XRAY_BIN" ]]; then
  echo "Downloading Xray-core (macOS arm64) into $WORKDIR ..."
  curl -fsSL -o "$WORKDIR/xray.zip" "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-macos-arm64-v8a.zip"
  unzip -q -o "$WORKDIR/xray.zip" -d "$WORKDIR" xray
  chmod +x "$WORKDIR/xray"
  XRAY_BIN="$WORKDIR/xray"
fi

CERT_PEM="$WORKDIR/server-cert.pem"
KEY_PEM="$WORKDIR/server-key.pem"

if [[ ! -f "$CERT_PEM" || ! -f "$KEY_PEM" ]]; then
  echo "Generating self-signed RSA cert (SAN: $HY2_SNI, localhost, 127.0.0.1) ..."
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
    -keyout "$KEY_PEM" -out "$CERT_PEM" \
    -config "$SCRIPT_DIR/openssl-san.cnf"
fi

SERVER_JSON="$WORKDIR/xray-server-hysteria2.json"
CLIENT_JSON="$WORKDIR/xray-client-hysteria2.json"
LINK_FILE="$WORKDIR/hysteria2-share-link.txt"

python3 - "$CERT_PEM" "$KEY_PEM" "$HY2_LISTEN" "$HY2_PORT" "$HY2_SNI" \
  "$HY2_AUTH" "$HY2_AUTH2" "$SERVER_JSON" "$CLIENT_JSON" "$LINK_FILE" "$SOCKS_PORT" <<'PY'
import json, pathlib, sys, urllib.parse

cert_path, key_path = sys.argv[1], sys.argv[2]
listen, port, sni = sys.argv[3], int(sys.argv[4]), sys.argv[5]
auth1, auth2 = sys.argv[6], sys.argv[7]
server_out, client_out, link_out = sys.argv[8], sys.argv[9], sys.argv[10]
socks_port = int(sys.argv[11])


def pem_lines(path: str) -> list:
    return pathlib.Path(path).read_text(encoding="utf-8").strip().splitlines()

cert_lines = pem_lines(cert_path)
key_lines = pem_lines(key_path)

inbound = {
    "listen": listen,
    "port": port,
    "protocol": "hysteria",
    "settings": {
        "version": 2,
        "clients": [
            {"email": "tes", "auth": auth1},
            {"email": "yugouyfyuf", "auth": auth2},
        ],
    },
    "streamSettings": {
        "network": "hysteria",
        "security": "tls",
        "hysteriaSettings": {"auth": "", "udpIdleTimeout": 60, "version": 2},
        "tlsSettings": {
            "allowInsecure": True,
            "alpn": ["h3"],
            "certificates": [
                {
                    "buildChain": False,
                    "certificate": cert_lines,
                    "key": key_lines,
                    "oneTimeLoading": False,
                    "usage": "encipherment",
                }
            ],
            "cipherSuites": "",
            "disableSystemRoot": False,
            "echForceQuery": "none",
            "echServerKeys": "",
            "enableSessionResumption": False,
            "maxVersion": "1.3",
            "minVersion": "1.2",
            "rejectUnknownSni": False,
            "serverName": sni,
            "settings": {"fingerprint": "chrome"},
        },
    },
    "tag": f"inbound-{port}",
    "sniffing": {
        "enabled": True,
        "destOverride": ["http", "tls", "quic"],
        "metadataOnly": False,
        "routeOnly": False,
    },
}

server_cfg = {
    "log": {"loglevel": "warning"},
    "inbounds": [inbound],
    "outbounds": [{"tag": "direct", "protocol": "freedom", "settings": {}}],
}

client_cfg = {
    "log": {"loglevel": "warning"},
    "inbounds": [
        {
            "tag": "socks-in",
            "listen": "127.0.0.1",
            "port": socks_port,
            "protocol": "socks",
            "settings": {"udp": True},
        }
    ],
    "outbounds": [
        {
            "tag": "proxy",
            "protocol": "hysteria",
            "settings": {"version": 2, "address": listen, "port": port},
            "streamSettings": {
                "network": "hysteria",
                "security": "tls",
                "tlsSettings": {
                    "serverName": sni,
                    "alpn": ["h3"],
                    "allowInsecure": True,
                    "fingerprint": "chrome",
                },
                "hysteriaSettings": {
                    "version": 2,
                    "auth": auth1,
                    "udpIdleTimeout": 60,
                },
            },
        },
        {"tag": "direct", "protocol": "freedom", "settings": {}},
    ],
    "routing": {
        "domainStrategy": "AsIs",
        "rules": [{"type": "field", "inboundTag": ["socks-in"], "outboundTag": "proxy"}],
    },
}

for path, obj in ((server_out, server_cfg), (client_out, client_cfg)):
    pathlib.Path(path).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

q = urllib.parse.urlencode(
    {"alpn": "h3", "fp": "chrome", "security": "tls", "sni": sni}
)
hi = listen
if ":" in hi and not hi.startswith("["):
    hi = f"[{hi}]"
remark = "hy2-local-e2e"
full = (
    f"hysteria2://{urllib.parse.quote(auth1, safe='')}@{hi}:{port}?{q}"
    f"#{urllib.parse.quote(remark)}"
)
pathlib.Path(link_out).write_text(full + "\n", encoding="utf-8")
print(full)
PY

echo ""
echo "Wrote:"
echo "  Server: $SERVER_JSON"
echo "  Client: $CLIENT_JSON"
echo "  Link:   $(cat "$LINK_FILE")"
echo ""

SERVER_LOG="$WORKDIR/server.log"
CLIENT_LOG="$WORKDIR/client.log"

cleanup() {
  [[ -n "${SERVER_PID:-}" ]] && kill "$SERVER_PID" 2>/dev/null || true
  [[ -n "${CLIENT_PID:-}" ]] && kill "$CLIENT_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  wait "$CLIENT_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Starting server Xray ..."
if "$XRAY_BIN" help 2>&1 | grep -qE '(^|\s)run(\s|$)'; then
  "$XRAY_BIN" run -c "$SERVER_JSON" >"$SERVER_LOG" 2>&1 &
else
  "$XRAY_BIN" -c "$SERVER_JSON" >"$SERVER_LOG" 2>&1 &
fi
SERVER_PID=$!
sleep 2
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Server failed to start:"
  cat "$SERVER_LOG"
  exit 1
fi

echo "Starting client Xray (SOCKS 127.0.0.1:$SOCKS_PORT) ..."
if "$XRAY_BIN" help 2>&1 | grep -qE '(^|\s)run(\s|$)'; then
  "$XRAY_BIN" run -c "$CLIENT_JSON" >"$CLIENT_LOG" 2>&1 &
else
  "$XRAY_BIN" -c "$CLIENT_JSON" >"$CLIENT_LOG" 2>&1 &
fi
CLIENT_PID=$!
sleep 2
if ! kill -0 "$CLIENT_PID" 2>/dev/null; then
  echo "Client failed to start:"
  cat "$CLIENT_LOG"
  exit 1
fi

echo "curl via SOCKS -> $HY2_CURL_URL"
code="$(
  curl -sS -o /dev/null -w '%{http_code}' \
    --socks5-hostname "127.0.0.1:$SOCKS_PORT" -m 20 "$HY2_CURL_URL" || true
)"
code="$(printf '%s' "$code" | tr -d '\r\n')"
[[ -z "$code" ]] && code="000"
echo "HTTP $code"

if [[ "$code" == "204" || "$code" =~ ^[23][0-9][0-9]$ ]]; then
  echo "E2E OK"
  exit 0
fi

echo "E2E FAIL — server log (tail):"
tail -n 30 "$SERVER_LOG" >&2 || true
echo "Client log (tail):"
tail -n 30 "$CLIENT_LOG" >&2 || true
exit 1
