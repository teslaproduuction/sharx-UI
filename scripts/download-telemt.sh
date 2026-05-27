#!/usr/bin/env bash
# Download official Telemt release binaries from https://github.com/telemt/telemt/releases
# for embedding in panel/node images (replaces local Rust build).
#
# Usage:
#   ./scripts/download-telemt.sh              # linux/amd64 + linux/arm64 (best effort)
#   ./scripts/download-telemt.sh amd64        # only linux/amd64
#   ./scripts/download-telemt.sh arm64        # only linux/arm64
#
# Environment:
#   TELEMT_VERSION  — release tag (default: latest from GitHub API, e.g. 3.4.12)
#
# Outputs:
#   third_party/telemt-sharx/prebuilt/linux-amd64/telemt
#   third_party/telemt-sharx/prebuilt/linux-arm64/telemt

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_BASE="$ROOT/third_party/telemt-sharx/prebuilt"
REPO_API="https://api.github.com/repos/telemt/telemt/releases"
RELEASE_BASE="https://github.com/telemt/telemt/releases/download"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Required command not found: $1" >&2
    exit 1
  }
}

need_cmd curl
need_cmd tar

verify_sha256() {
  local dir="$1"
  local checksum_file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    (cd "$dir" && sha256sum -c "$checksum_file")
  elif command -v shasum >/dev/null 2>&1; then
    (cd "$dir" && shasum -a 256 -c "$checksum_file")
  else
    echo "sha256sum or shasum required for checksum verification" >&2
    exit 1
  fi
}

resolve_version() {
  if [ -n "${TELEMT_VERSION:-}" ]; then
    echo "${TELEMT_VERSION#v}"
    return
  fi
  local tag
  tag="$(curl -fsSL "$REPO_API/latest" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  if [ -z "$tag" ]; then
    echo "Failed to resolve latest Telemt release tag" >&2
    exit 1
  fi
  echo "${tag#v}"
}

download_one() {
  local arch_dl="$1"   # x86_64-linux-musl | aarch64-linux-musl
  local out_subdir="$2"  # linux-amd64 | linux-arm64
  local version="$3"

  local outdir="$OUT_BASE/$out_subdir"
  local asset="telemt-${arch_dl}.tar.gz"
  local checksum_file="${asset}.sha256"
  local url="${RELEASE_BASE}/${version}/${asset}"
  local checksum_url="${RELEASE_BASE}/${version}/${checksum_file}"
  local tmpdir
  tmpdir="$(mktemp -d)"

  mkdir -p "$outdir"
  echo "==> Telemt ${version}: downloading ${asset} -> ${outdir}/telemt"

  curl -fsSL "$url" -o "${tmpdir}/${asset}"
  curl -fsSL "$checksum_url" -o "${tmpdir}/${checksum_file}"

  verify_sha256 "$tmpdir" "$checksum_file"

  tar -xzf "${tmpdir}/${asset}" -C "$tmpdir"
  local bin="${tmpdir}/telemt"
  if [ ! -f "$bin" ]; then
    # Some archives may nest the binary; find it.
    bin="$(find "$tmpdir" -maxdepth 2 -type f -name telemt | head -1)"
  fi
  if [ -z "$bin" ] || [ ! -f "$bin" ]; then
    echo "telemt binary not found in archive ${asset}" >&2
    exit 1
  fi

  cp "$bin" "${outdir}/telemt"
  chmod +x "${outdir}/telemt"
  rm -rf "$tmpdir"
  ls -la "${outdir}/telemt"
}

VERSION="$(resolve_version)"
echo "Using Telemt version: ${VERSION}"

want="${1:-all}"
case "$want" in
  amd64|x86_64)
    download_one "x86_64-linux-musl" "linux-amd64" "$VERSION"
    ;;
  arm64|aarch64)
    download_one "aarch64-linux-musl" "linux-arm64" "$VERSION"
    ;;
  all)
    download_one "x86_64-linux-musl" "linux-amd64" "$VERSION"
    if download_one "aarch64-linux-musl" "linux-arm64" "$VERSION"; then
      :
    else
      echo "Note: linux/arm64 download failed. amd64 artifact is still valid." >&2
    fi
    ;;
  *)
    echo "usage: $0 [amd64|arm64|all]" >&2
    exit 2
    ;;
esac

echo "Done. Rebuild panel/node images; they will pick up prebuilt/*/telemt automatically."
