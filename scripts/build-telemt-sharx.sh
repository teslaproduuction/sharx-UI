#!/usr/bin/env bash
# One-off Telemt (SharX fork) Linux musl binaries for embedding in panel/node images.
# Run when third_party/telemt-sharx changes — not on every docker build.
#
# Usage:
#   ./scripts/build-telemt-sharx.sh              # linux/amd64 + linux/arm64 (best effort)
#   ./scripts/build-telemt-sharx.sh amd64       # only linux/amd64
#   ./scripts/build-telemt-sharx.sh arm64       # only linux/arm64
#
# Requires: Docker. Outputs:
#   third_party/telemt-sharx/prebuilt/linux-amd64/telemt
#   third_party/telemt-sharx/prebuilt/linux-arm64/telemt

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/third_party/telemt-sharx"
RUST_IMAGE="${RUST_IMAGE:-rust:alpine}"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or not reachable." >&2
  exit 1
fi

build_one() {
  local platform="$1"
  local out_subdir="$2"
  local outdir="$SRC/prebuilt/$out_subdir"
  mkdir -p "$outdir"
  echo "==> Telemt SharX: building for $platform -> $outdir/telemt"
  docker run --rm --platform "$platform" \
    -v "$SRC:/src/telemt:ro" \
    -v "$outdir:/out" \
    "$RUST_IMAGE" \
    sh -ec '
      apk add --no-cache musl-dev git perl make
      rm -rf /tmp/telemt-build
      cp -a /src/telemt /tmp/telemt-build
      cd /tmp/telemt-build
      cargo build --release
      cp target/release/telemt /out/telemt
      chmod +x /out/telemt
      ls -la /out/telemt
    '
}

want="${1:-all}"
case "$want" in
  amd64|x86_64) build_one linux/amd64 linux-amd64 ;;
  arm64|aarch64) build_one linux/arm64 linux-arm64 ;;
  all)
    build_one linux/amd64 linux-amd64
    if build_one linux/arm64 linux-arm64; then
      :
    else
      echo "Note: linux/arm64 build failed (common without emulator). amd64 artifact is still valid." >&2
    fi
    ;;
  *)
    echo "usage: $0 [amd64|arm64|all]" >&2
    exit 2
    ;;
esac

echo "Done. Rebuild panel/node images; they will pick up prebuilt/*/telemt automatically."
