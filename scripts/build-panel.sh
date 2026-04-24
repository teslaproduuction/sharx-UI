#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/panel"
npm ci
npm run build
rm -rf "$ROOT/web/panel"
mkdir -p "$ROOT/web/panel"
cp -R "$ROOT/panel/out/"* "$ROOT/web/panel/"
echo "Copied static panel to web/panel"
