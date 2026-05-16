#!/usr/bin/env bash
# Phase 8 — orchestration of test/scenarios/*.sh against the docker-compose stack.
# Each scenario emits "SCENARIO <name> PASS/FAIL"; non-zero exit on any FAIL.
set -euo pipefail

cd "$(dirname "$0")"

if ! docker compose ps panel >/dev/null 2>&1; then
  echo "stack not up — run: docker compose up -d" >&2
  exit 2
fi

fail=0
for s in scenarios/*.sh; do
  [[ -e "$s" ]] || continue
  name="$(basename "${s%.sh}")"
  echo "=== SCENARIO $name ==="
  if bash "$s"; then
    echo "SCENARIO $name PASS"
  else
    echo "SCENARIO $name FAIL"
    fail=$((fail + 1))
  fi
done

if (( fail > 0 )); then
  echo "$fail scenario(s) failed"
  exit 1
fi
echo "all scenarios passed"
