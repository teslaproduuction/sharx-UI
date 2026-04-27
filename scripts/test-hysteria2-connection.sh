#!/usr/bin/env bash
# Loop until Xray (core) can use a Hy2 outbound and traffic through local SOCKS succeeds.
#
# Builds a minimal Xray JSON: SOCKS inbound -> hysteria outbound (same shape as panel / subJsonService.genHy).
#
# Requires: curl, python3. Xray-core: use PATH, or set XRAY_BIN, or let the script download
# a release build into XRAY_DOWNLOAD_CACHE (default: ~/.cache/sharx-hy2-test).
#
# Usage:
#   ./scripts/test-hysteria2-connection.sh 'hysteria2://auth@host:port?...'
#   HYSTERIA2_URI='hysteria2://...' ./scripts/test-hysteria2-connection.sh
#
# Env:
#   XRAY_BIN              path to xray (default: PATH, then auto-download)
#   XRAY_DOWNLOAD_CACHE   directory for cached xray binary (default: ~/.cache/sharx-hy2-test)
#   HYSTERIA_TLS_INSECURE 1|0  tlsSettings.allowInsecure (default: 1 — self-signed / lab SNI)
#   HYSTERIA_UDP_IDLE     hysteriaSettings.udpIdleTimeout seconds (default: 60)
#   XRAY_LOGLEVEL         log.loglevel (default: warning; use debug when diagnosing)
#   XRAY_BOOT_WAIT_SEC    max wait for SOCKS port to accept (default: 20)
#   HYSTERIA_CURL_URL     URL via SOCKS (default: plain HTTP 204 — avoids false negatives when Hy2 is slow)
#   HYSTERIA_CURL_TIMEOUT max time for curl (default: 45; QUIC handshake over LAN/Wi‑Fi can exceed 25s)
#   HYSTERIA_CURL_VERBOSE 1  print curl -v to stderr on each attempt
#   HYSTERIA_SKIP_FINGERPRINT 1  omit tlsSettings.fingerprint (try if uTLS / fp mismatch to server)
#   RETRY_SLEEP_SEC       pause between full attempts (default: 3)
#   MAX_ATTEMPTS          empty = unlimited; else stop after N failed attempts

set -u

URI="${1:-${HYSTERIA2_URI:-}}"
if [[ -z "${URI}" ]]; then
  echo "Usage: $0 'hysteria2://auth@host:port?...'" >&2
  echo "   or: HYSTERIA2_URI='...' $0" >&2
  exit 2
fi

xray_release_zip() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os:$arch" in
    Darwin:arm64) echo "Xray-macos-arm64-v8a.zip" ;;
    Darwin:x86_64) echo "Xray-macos-64.zip" ;;
    Linux:aarch64) echo "Xray-linux-arm64-v8a.zip" ;;
    Linux:arm64) echo "Xray-linux-arm64-v8a.zip" ;;
    Linux:x86_64) echo "Xray-linux-64.zip" ;;
    *)
      echo ""
      ;;
  esac
}

ensure_xray_bin() {
  local cache zip url
  if [[ -n "${XRAY_BIN:-}" ]]; then
    if [[ ! -x "$XRAY_BIN" ]]; then
      echo "XRAY_BIN is not executable: $XRAY_BIN" >&2
      exit 127
    fi
    return 0
  fi
  if command -v xray >/dev/null 2>&1; then
    XRAY_BIN="$(command -v xray)"
    return 0
  fi
  zip="$(xray_release_zip)"
  if [[ -z "$zip" ]]; then
    echo "No xray in PATH and no auto-download for $(uname -s)/$(uname -m)." >&2
    echo "Install Xray-core from https://github.com/XTLS/Xray-core/releases or set XRAY_BIN." >&2
    exit 127
  fi
  cache="${XRAY_DOWNLOAD_CACHE:-${HOME}/.cache/sharx-hy2-test}"
  mkdir -p "$cache"
  if [[ -x "$cache/xray" ]]; then
    XRAY_BIN="$cache/xray"
    return 0
  fi
  url="https://github.com/XTLS/Xray-core/releases/latest/download/${zip}"
  echo "Downloading Xray-core ($zip) -> $cache ..." >&2
  if ! curl -fsSL -o "$cache/$zip" "$url"; then
    echo "Failed to download $url" >&2
    exit 127
  fi
  if ! unzip -q -o "$cache/$zip" -d "$cache" xray 2>/dev/null; then
    echo "Failed to unzip xray from $cache/$zip" >&2
    exit 127
  fi
  chmod +x "$cache/xray"
  rm -f "$cache/$zip"
  XRAY_BIN="$cache/xray"
}

ensure_xray_bin

export HYSTERIA_TLS_INSECURE="${HYSTERIA_TLS_INSECURE:-1}"
export HYSTERIA_UDP_IDLE="${HYSTERIA_UDP_IDLE:-60}"
export XRAY_LOGLEVEL="${XRAY_LOGLEVEL:-warning}"

XRAY_BOOT_WAIT_SEC="${XRAY_BOOT_WAIT_SEC:-20}"
HYSTERIA_CURL_URL="${HYSTERIA_CURL_URL:-http://cp.cloudflare.com/generate_204}"
RETRY_SLEEP_SEC="${RETRY_SLEEP_SEC:-3}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-}"
HYSTERIA_CURL_TIMEOUT="${HYSTERIA_CURL_TIMEOUT:-45}"
HYSTERIA_CURL_VERBOSE="${HYSTERIA_CURL_VERBOSE:-}"

pick_socks_port() {
  python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'
}

write_xray_json() {
  local uri="$1" path="$2" socks_port="$3"
  HYSTERIA_TLS_INSECURE="${HYSTERIA_TLS_INSECURE}" \
  HYSTERIA_UDP_IDLE="${HYSTERIA_UDP_IDLE}" \
  XRAY_LOGLEVEL="${XRAY_LOGLEVEL}" \
  HYSTERIA_SKIP_FINGERPRINT="${HYSTERIA_SKIP_FINGERPRINT:-}" \
  python3 - "$uri" "$path" "$socks_port" <<'PY'
import json, os, sys, urllib.parse

uri, path, socks_port = sys.argv[1], sys.argv[2], int(sys.argv[3])
force_insecure = os.environ.get("HYSTERIA_TLS_INSECURE", "1") in ("1", "true", "yes")
udp_idle = int(os.environ.get("HYSTERIA_UDP_IDLE", "60"))
loglevel = os.environ.get("XRAY_LOGLEVEL", "warning")
skip_fp = os.environ.get("HYSTERIA_SKIP_FINGERPRINT", "").lower() in ("1", "true", "yes")

p = urllib.parse.urlparse(uri)
if p.scheme not in ("hysteria2", "hy2"):
    sys.stderr.write("URI scheme must be hysteria2://\n")
    sys.exit(2)

host = p.hostname
port = p.port
if not host or not port:
    sys.stderr.write("URI must include host and port\n")
    sys.exit(2)

auth = p.username or ""
if p.password:
    auth = f"{auth}:{p.password}"

qs = urllib.parse.parse_qs(p.query, keep_blank_values=True)


def q1(key: str, default: str = "") -> str:
    v = qs.get(key)
    return v[0] if v else default


sni = q1("sni") or host
insecure = force_insecure or q1("insecure", "").lower() in ("1", "true", "yes")
fp = q1("fp") or q1("fingerprint") or "chrome"
alpn_raw = q1("alpn", "h3")
alpn = [x.strip() for x in alpn_raw.split(",") if x.strip()]
if not alpn:
    alpn = ["h3"]

tls_settings = {
    "serverName": sni,
    "alpn": alpn,
    "allowInsecure": insecure,
}
# uTLS: Xray accepts fingerprint on tlsSettings root and/or under tlsSettings.settings (panel uses nested on server).
if fp and not skip_fp:
    tls_settings["fingerprint"] = fp
    tls_settings["settings"] = {"fingerprint": fp}

cfg = {
    "log": {"loglevel": loglevel},
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
            "settings": {"version": 2, "address": host, "port": int(port)},
            "streamSettings": {
                "network": "hysteria",
                "security": "tls",
                "tlsSettings": tls_settings,
                "hysteriaSettings": {"version": 2, "auth": auth, "udpIdleTimeout": udp_idle},
                "finalmask": {
                    "quicParams": {"debug": False, "congestion": "bbr"},
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

with open(path, "w", encoding="utf-8") as f:
    json.dump(cfg, f, indent=2)
    f.write("\n")
PY
}

socks_ready() {
  local port="$1"
  python3 -c "import socket; s=socket.socket(); s.settimeout(0.4); s.connect(('127.0.0.1', int('$port'))); s.close()" 2>/dev/null
}

one_attempt() {
  local attempt_no="$1"
  local cfg log socks_port xpid wait_left

  # macOS mktemp requires trailing XXXXXX; Xray detects JSON by file suffix.
  _cfg="$(mktemp "${TMPDIR:-/tmp}/hy2-xray-test.XXXXXX")"
  cfg="${_cfg}.json"
  mv "$_cfg" "$cfg"
  log="$(mktemp "${TMPDIR:-/tmp}/hy2-xray-log.XXXXXX")"
  socks_port="$(pick_socks_port)"

  write_xray_json "$URI" "$cfg" "$socks_port"

  echo "--- attempt ${attempt_no} ---"
  echo "config: $cfg (SOCKS 127.0.0.1:$socks_port)"
  echo "curl target: $HYSTERIA_CURL_URL"

  if "$XRAY_BIN" help 2>&1 | grep -qE '(^|\s)run(\s|$)'; then
    echo "xray: $XRAY_BIN run -c $cfg"
    "$XRAY_BIN" run -c "$cfg" >"$log" 2>&1 &
  else
    echo "xray: $XRAY_BIN -c $cfg"
    "$XRAY_BIN" -c "$cfg" >"$log" 2>&1 &
  fi
  xpid=$!

  wait_left="$XRAY_BOOT_WAIT_SEC"
  while [[ "$wait_left" -gt 0 ]]; do
    if ! kill -0 "$xpid" 2>/dev/null; then
      echo "FAIL: xray exited before SOCKS was ready (see $log)"
      tail -n 60 "$log" >&2 || true
      rm -f "$cfg" "$log"
      return 1
    fi
    if socks_ready "$socks_port"; then
      break
    fi
    sleep 1
    wait_left=$((wait_left - 1))
  done

  if ! socks_ready "$socks_port"; then
    echo "FAIL: SOCKS not accepting within ${XRAY_BOOT_WAIT_SEC}s"
    tail -n 60 "$log" >&2 || true
    kill "$xpid" 2>/dev/null || true
    wait "$xpid" 2>/dev/null || true
    rm -f "$cfg" "$log"
    return 1
  fi

  local http_code
  if [[ "${HYSTERIA_CURL_VERBOSE}" == "1" || "${HYSTERIA_CURL_VERBOSE}" == "true" ]]; then
    # Verbose on stderr; keep http_code on stdout only (tty so it is not swallowed by capture).
    http_code="$(
      curl -sS -v -o /dev/null -w '%{http_code}' \
        --socks5-hostname "127.0.0.1:${socks_port}" \
        --connect-timeout 15 \
        -m "$HYSTERIA_CURL_TIMEOUT" \
        "$HYSTERIA_CURL_URL" 2>/dev/tty
    )" || true
  else
    http_code="$(
      curl -sS -o /dev/null -w '%{http_code}' \
        --socks5-hostname "127.0.0.1:${socks_port}" \
        --connect-timeout 15 \
        -m "$HYSTERIA_CURL_TIMEOUT" \
        "$HYSTERIA_CURL_URL" 2>/dev/null
    )" || true
  fi
  http_code="$(printf '%s' "$http_code" | tr -d '\r\n')"
  [[ -z "$http_code" ]] && http_code="000"

  kill "$xpid" 2>/dev/null || true
  wait "$xpid" 2>/dev/null || true

  if [[ "$http_code" =~ ^[23][0-9][0-9]$ ]]; then
    echo "OK: curl via Xray SOCKS got HTTP $http_code from $HYSTERIA_CURL_URL"
    rm -f "$cfg" "$log"
    return 0
  fi

  echo "FAIL: curl HTTP $http_code (expected 2xx/3xx)." >&2
  echo "  Hy2 = QUIC over UDP — this host must reach server:UDP (not only TCP). Wi‑Fi/firewall/Docker host network often block it." >&2
  echo "  Try: XRAY_LOGLEVEL=debug HYSTERIA_CURL_VERBOSE=1 HYSTERIA_SKIP_FINGERPRINT=1 $0 ..." >&2
  echo "--- xray log (last 100 lines) ---" >&2
  tail -n 100 "$log" >&2 || true
  rm -f "$cfg" "$log"
  return 1
}

attempt=0
while true; attempt=$((attempt + 1)); do
  if one_attempt "$attempt"; then
    echo "All checks passed."
    exit 0
  fi
  if [[ -n "$MAX_ATTEMPTS" && "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
    echo "Giving up after $MAX_ATTEMPTS attempts."
    exit 1
  fi
  echo "Retry in ${RETRY_SLEEP_SEC}s (Ctrl+C to stop)..."
  sleep "$RETRY_SLEEP_SEC"
done
