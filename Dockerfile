# ========================================================
# Stage: Next.js static panel
# ========================================================
FROM node:22-alpine AS panelui
WORKDIR /app
# panel/scripts/gen-locales.mjs reads ../../web/translation/*.toml at prebuild
# to flatten into public/locales/*.json. The translation TOMLs live outside
# panel/, so they need to be present in the build context.
COPY web/translation/ ./web/translation/
WORKDIR /app/panel
# Must match XUI / SharX `webBasePath` (e.g. / or /prefix). `next.config` `basePath` + client `linkP()`.
ARG NEXT_PUBLIC_BASE_PATH=/
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
# Bump Node heap so the Next.js production build (compile + tsc lint) does not OOM.
# Default is ~512MB; tsc on this panel needs ~1.2GB. 2048 leaves headroom on a 4GB build host.
ENV NODE_OPTIONS="--max-old-space-size=4096"
COPY panel/package.json panel/package-lock.json ./
# react-simple-maps declares peer react@18; panel uses react@19 — same as panel/.npmrc locally.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --cache /root/.npm --prefer-offline --legacy-peer-deps
COPY panel/ ./
RUN npm run build && cp -R out /webpanel

# Telemt: ./scripts/download-telemt.sh → third_party/telemt-sharx/prebuilt/linux-*/telemt (or DockerInit fallback)
# SharX Telemt fork build fallback: ./scripts/build-telemt-sharx.sh

# ========================================================
# Stage: hiddify-sing-box (Phase 2 — singleton sidecar for mieru/AnyTLS/Naive/TUIC)
#
# Pinned hiddify fork v1.13.0.h5 (Feb 2026 release). Patched per-user v2ray_api
# stats — see .agent/protocols/singbox.md and stats.go in the fork.
# Prebuilt linux-amd64-glibc.tar.gz from upstream releases — no Go build step
# (panel/node hosts may have only 1 GB RAM; we never build sing-box on the node).
# ========================================================
# Build shtorm-7/sing-box-extended from source — this fork keeps AmneziaWG (the
# `amnezia` wireguard endpoint option, which hiddify dropped) AND per-user
# v2ray_api stats + anytls/tuic/hy2 + mieru-outbound + mieru-INBOUND (server).
# The mieru inbound is grafted via static files in third_party/singbox-mieru-graft/:
#   - protocol/mieru/{common,inbound}.go  (from hiddify/hiddify-sing-box extended)
#   - option/mieru_inbound.go             (MieruInboundOptions + MieruUser structs)
# include/registry.go is patched with sed to call mieru.RegisterInbound().
# Targets enfein/mieru v3.17 already in shtorm-7 go.mod — no bump needed
# (apis/server surface: Store/Start/Stop/IsRunning/Accept stable from ≥v3.17).
# Build tags stay lean; go.mod requires go>=1.26.1.
FROM golang:1.26-bookworm AS singbox-fetch
ARG SINGBOX_REF=extended
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git clone --depth=1 --branch ${SINGBOX_REF} --recurse-submodules --shallow-submodules \
        https://github.com/shtorm-7/sing-box-extended.git /src

# ── mieru INBOUND graft ──────────────────────────────────────────────────────
# 1+2) Copy the two new protocol/mieru/*.go files (written verbatim in repo).
COPY third_party/singbox-mieru-graft/protocol/mieru/common.go  /src/protocol/mieru/common.go
COPY third_party/singbox-mieru-graft/protocol/mieru/inbound.go /src/protocol/mieru/inbound.go

# 3) Add MieruInboundOptions + MieruUser to the option package.
#    Separate file keeps it clean vs patching the existing mieru.go.
COPY third_party/singbox-mieru-graft/option/mieru_inbound.go   /src/option/mieru_inbound.go

# 4) Register the inbound inside InboundRegistry() — anchor on anytls.RegisterInbound
#    (mieru.RegisterOutbound lives in OutboundRegistry(), the WRONG function/registry
#    type, so anchoring there silently fails to wire the inbound).
RUN sed -i 's/anytls\.RegisterInbound(registry)/anytls.RegisterInbound(registry)\n\tmieru.RegisterInbound(registry)/' \
    /src/include/registry.go && \
    grep -q "mieru.RegisterInbound(registry)" /src/include/registry.go || (echo "mieru inbound registration sed FAILED" && exit 1)

# 5) shtorm-7 pins enfein/mieru v3.17 which lacks apis/server (added v3.27).
#    Bump to v3.27; the outbound-side APIs (apis/client/common/model) are
#    stable across this range so existing outbound.go compiles unchanged.
RUN cd /src && go get github.com/enfein/mieru/v3@v3.27.0 && go mod tidy
# ── end mieru INBOUND graft ──────────────────────────────────────────────────

WORKDIR /src
ENV CGO_ENABLED=0
ARG SINGBOX_VERSION=
RUN SBVER="${SINGBOX_VERSION:-$(git -C /src describe --tags --exact-match 2>/dev/null || echo ${SINGBOX_REF}-$(git -C /src rev-parse --short HEAD 2>/dev/null || echo unknown))}" && \
    echo "sing-box version stamp: ${SBVER}" && \
    go build -trimpath \
      -tags "with_quic,with_v2ray_api,with_clash_api,with_utls,with_acme,with_gvisor,with_dhcp,with_wireguard" \
      -ldflags "-w -s -X github.com/sagernet/sing-box/constant.Version=${SBVER}" \
      -o /out/sing-box ./cmd/sing-box && \
    /out/sing-box version | head -1

# ========================================================
# Stage: Builder
# ========================================================
FROM golang:1.26-alpine AS builder
WORKDIR /app
ARG TARGETARCH
ARG BUILDKIT_INLINE_CACHE=1

RUN apk --no-cache --update add \
  build-base \
  gcc \
  curl \
  unzip \
  bash

# Copy go mod files first for better caching
COPY go.mod go.sum ./

# Download dependencies (this layer will be cached if go.mod/go.sum don't change)
# Using cache mount for Go modules to speed up builds
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy only Go sources (web/panel comes from panelui; omitted via .dockerignore).
# Panel or doc edits no longer invalidate the compile layer.
COPY config/ ./config/
# Optional: docker build --build-arg SHARX_VERSION=1.2.3 to stamp config/version before compile.
ARG SHARX_VERSION=
RUN if [ -n "$SHARX_VERSION" ]; then printf '%s' "$SHARX_VERSION" > config/version; fi
COPY database/ ./database/
COPY logger/ ./logger/
COPY util/ ./util/
COPY conndrop/ ./conndrop/
COPY xray/ ./xray/
COPY sub/ ./sub/
COPY node/ ./node/
# Go API and services (.dockerignore omits web/panel/; static UI comes from panelui below).
COPY web/ ./web/
# Optional Telemt prebuilt binary (see scripts/download-telemt.sh); small layer, avoids compile in image build.
COPY third_party/telemt-sharx/prebuilt/ ./third_party/telemt-sharx/prebuilt/
COPY main.go ./
COPY DockerInit.sh DockerEntrypoint.sh ./
COPY --from=panelui /webpanel/ ./web/panel

# Make all .sh files executable and fix line endings if needed
RUN chmod +x *.sh && \
    sed -i 's/\r$//' *.sh && \
    ls -la DockerInit.sh

ENV CGO_ENABLED=1
ENV CGO_CFLAGS="-D_LARGEFILE64_SOURCE"

# Build with cache mount for Go build cache
RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -ldflags "-w -s" -o build/x-ui main.go

RUN bash DockerInit.sh "$TARGETARCH"
RUN ARCH="" && case "${TARGETARCH}" in amd64) ARCH=linux-amd64 ;; arm64) ARCH=linux-arm64 ;; esac && \
    PRE="/app/third_party/telemt-sharx/prebuilt/${ARCH}/telemt" && \
    if [ -n "$ARCH" ] && [ -f "$PRE" ]; then \
      cp "$PRE" /app/build/bin/telemt && chmod +x /app/build/bin/telemt && \
      echo "telemt: prebuilt (${ARCH})"; \
    else \
      echo "telemt: no prebuilt at prebuilt/${ARCH:-skip}/telemt — keeping DockerInit binary"; \
    fi

# Phase 2 — embed hiddify-sing-box binary alongside Xray/Telemt for the singleton sidecar.
COPY --from=singbox-fetch /out/sing-box /app/build/bin/sing-box

# ========================================================
# Stage: Final Image of SharX
# ========================================================
FROM alpine
ENV TZ=Asia/Tehran
WORKDIR /app

RUN apk add --no-cache --update \
  ca-certificates \
  tzdata \
  fail2ban \
  bash \
  postgresql-client \
  conntrack-tools \
  # Phase 2: hiddify-sing-box prebuilt is dynamically linked against glibc
  # (interpreter /lib64/ld-linux-x86-64.so.2). gcompat + libc6-compat give
  # alpine the loader + symbols sing-box needs to start without a "no such
  # file or directory" exec error.
  gcompat \
  libc6-compat

COPY --from=builder /app/build/ /app/
COPY --from=builder /app/DockerEntrypoint.sh /app/

# Configure fail2ban
RUN rm -f /etc/fail2ban/jail.d/alpine-ssh.conf \
  && cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local \
  && sed -i "s/^\[ssh\]$/&\nenabled = false/" /etc/fail2ban/jail.local \
  && sed -i "s/^\[sshd\]$/&\nenabled = false/" /etc/fail2ban/jail.local \
  && sed -i "s/#allowipv6 = auto/allowipv6 = auto/g" /etc/fail2ban/fail2ban.conf

RUN chmod +x \
  /app/DockerEntrypoint.sh \
  /app/x-ui

ENV XUI_ENABLE_FAIL2BAN="true"
EXPOSE 2053
VOLUME [ "/etc/x-ui" ]
CMD [ "./x-ui" ]
ENTRYPOINT [ "/app/DockerEntrypoint.sh" ]
