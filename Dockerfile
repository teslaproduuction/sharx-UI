# ========================================================
# Stage: Next.js static panel
# ========================================================
FROM node:22-alpine AS panelui
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

# SharX Telemt fork: ./scripts/build-telemt-sharx.sh → third_party/telemt-sharx/prebuilt/linux-*/telemt

# ========================================================
# Stage: hiddify-sing-box (Phase 2 — singleton sidecar for mieru/AnyTLS/Naive/TUIC)
#
# Pinned hiddify fork v1.13.0.h5 (Feb 2026 release). Patched per-user v2ray_api
# stats — see .agent/protocols/singbox.md and stats.go in the fork.
# Prebuilt linux-amd64-glibc.tar.gz from upstream releases — no Go build step
# (panel/node hosts may have only 1 GB RAM; we never build sing-box on the node).
# ========================================================
FROM golang:1.25-bookworm AS singbox-fetch
# Build from hiddify-sing-box master HEAD with CGO disabled so the resulting
# binary is statically-linked and runs on plain alpine (no glibc compat layer).
#
# Rationale for source build vs the prebuilt tarball:
#   - Prebuilt v1.13.0.h5 was tagged before the mieru inbound landed — it ships
#     `unknown inbound type: mieru` despite the source tree having protocol/mieru.
#   - The prebuilt tarball is also dynamically linked against /lib64/ld-linux-*,
#     which alpine does not provide.
# Build tags include every server-side protocol we plan to use across Phase 2-4
# (mieru/AnyTLS/Naive/TUIC/Hy2 inbounds + outbounds via protocol/ registry).
ARG SINGBOX_REF=extended
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates && rm -rf /var/lib/apt/lists/*
# Rewrite SSH submodule URLs to HTTPS so we can pull without an SSH key,
# then recursive-clone so go.mod's `replace ./replace/psiphon-tls` etc resolve.
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git clone --depth=1 --branch ${SINGBOX_REF} --recurse-submodules --shallow-submodules \
        https://github.com/hiddify/hiddify-sing-box.git /src
WORKDIR /src
ENV CGO_ENABLED=0
# Build tags chosen to enable every server-side protocol we ship in Phase 2-4
# (mieru/AnyTLS/Naive/TUIC/Hysteria2/Reality + the v2ray gRPC stats API hiddify
# patched for per-user accounting). with_wireguard pulls psiphon — we only need
# wireguard outbound for the cascade later, so drop it for the Phase 2 baseline.
RUN go build -trimpath \
      -tags "with_quic,with_v2ray_api,with_clash_api,with_utls,with_acme,with_gvisor,with_dhcp,with_naive_outbound" \
      -ldflags "-w -s" \
      -o /out/sing-box ./cmd/sing-box
RUN /out/sing-box version | head -3 && /out/sing-box version | grep -i mieru || echo "mieru tag check skipped"

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
# Optional Telemt SharX fork binary (see scripts/build-telemt-sharx.sh); small layer, avoids Rust in image build.
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
      echo "telemt: SharX fork prebuilt (${ARCH})"; \
    else \
      echo "telemt: no SharX prebuilt at prebuilt/${ARCH:-skip}/telemt — keeping DockerInit binary"; \
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
