#!/usr/bin/env bash
# Panel API coverage audit — lists backend routes and panel/() usage for manual
# comparison with PANEL_API_COVERAGE.md. Run from repo any cwd:
#   bash sharx-code/scripts/audit-panel-api-coverage.sh
# or:
#   cd sharx-code && ./scripts/audit-panel-api-coverage.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONTROLLER="$ROOT/web/controller"
PANEL="$ROOT/panel"

if [[ ! -d "$CONTROLLER" ]]; then
  echo "error: expected $CONTROLLER (run from project with sharx-code layout)" >&2
  exit 1
fi

echo "== Backend route registrations (g.GET / g.POST / g.HEAD) =="
if command -v rg >/dev/null 2>&1; then
  rg 'g\.(GET|POST|HEAD|PUT|DELETE|PATCH)\(' "$CONTROLLER" --glob '*.go' --no-heading || true
else
  grep -E -n 'g\.(GET|POST|HEAD|PUT|DELETE|PATCH)\(' "$CONTROLLER"/*.go 2>/dev/null || true
fi

echo ""
echo "== New web: panel( ... ) and p( 'login' | 'getTwoFactor' | 'ws' ) =="
if command -v rg >/dev/null 2>&1; then
  rg "panel\(" "$PANEL" --glob '*.{ts,tsx}' -n || true
  echo ""
  rg "p\(\s*[\"'](?:login|getTwoFactor|ws|logout)" "$PANEL" --glob '*.{ts,tsx}' -n || true
else
  grep -R -n "panel(" "$PANEL" --include='*.ts' --include='*.tsx' 2>/dev/null || true
fi

echo ""
echo "== Done. Update sharx-code/panel/PANEL_API_COVERAGE.md if routes differ. =="
