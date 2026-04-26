#!/bin/sh
# Named volume at /app/bin hides image files; re-seed xray+geo from the image when missing
# or when the volume has a *different* xray-linux-* (e.g. stale xray-linux-amd64 on an arm64 node).
# Expected name matches Go runtime: xray-$(goos)-$(goarch) e.g. xray-linux-arm64 in linux/arm64 containers.
set -e
needname=""
if [ -d /opt/sharx-node-embedded/bin ]; then
  case "$(uname -m)" in
    x86_64)  needname="xray-linux-amd64" ;;
    aarch64) needname="xray-linux-arm64" ;;
    i386|i486|i686) needname="xray-linux-386" ;;
    armv7l)  needname="xray-linux-arm32" ;;
    armv6l)  needname="xray-linux-armv6" ;;
    *)       needname="" ;;
  esac
  if [ -n "$needname" ] && [ ! -f "/opt/sharx-node-embedded/bin/$needname" ]; then
    needname=""
  fi
  if [ -z "$needname" ]; then
    need=$(find /opt/sharx-node-embedded/bin -maxdepth 1 -name 'xray-linux-*' -type f 2>/dev/null | head -1)
    if [ -n "$need" ]; then
      needname=$(basename "$need")
    fi
  fi
  if [ -n "$needname" ] && [ -f "/opt/sharx-node-embedded/bin/$needname" ]; then
    existing=$(find /app/bin -maxdepth 1 -name 'xray-linux-*' -type f 2>/dev/null | head -1)
    exname=""
    if [ -n "$existing" ]; then
      exname=$(basename "$existing")
    fi
    if [ ! -f "/app/bin/$needname" ] || { [ -n "$exname" ] && [ "$exname" != "$needname" ]; }; then
      echo "sharx-node: seeding /app/bin from image (need ${needname}, was ${exname:-empty})" >&2
      cp -a /opt/sharx-node-embedded/bin/. /app/bin/
    fi
  fi
fi
exec "$@"
