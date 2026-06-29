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
# Stage: sing-box (Phase 2 — singleton sidecar for mieru/AnyTLS/Naive/TUIC/Hy2)
#
# Built from source against shtorm-7/sing-box-extended. This fork keeps AmneziaWG
# (the `amnezia` wireguard endpoint option, which hiddify dropped) AND per-user
# v2ray_api stats + anytls/tuic/hy2 + native mieru outbound AND inbound (server).
# Build tags stay lean; go.mod requires go>=1.26.1.
# ========================================================
FROM golang:1.26-bookworm AS singbox-fetch
# Pin shtorm-7/sing-box-extended to a known-good commit. This fork keeps the
# AmneziaWG `amnezia` wireguard endpoint option (hiddify dropped it), per-user
# v2ray_api stats, anytls/tuic/hy2, AND native mieru inbound + outbound
# (include/registry.go registers both). No source graft is required — upstream
# ships everything we need. Pinned for reproducible builds: bump SINGBOX_REF to
# advance to a newer extended commit.
ARG SINGBOX_REF=a27453e4f7d179585436862d7cadfcef7b518aa6
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git config --global url."https://github.com/".insteadOf "git@github.com:" && \
    git clone --filter=blob:none https://github.com/shtorm-7/sing-box-extended.git /src && \
    git -C /src checkout ${SINGBOX_REF} && \
    git -C /src submodule update --init --recursive --depth 1

WORKDIR /src
ENV CGO_ENABLED=0
ARG SINGBOX_VERSION=
RUN SBVER="${SINGBOX_VERSION:-$(git -C /src describe --tags --exact-match 2>/dev/null || echo extended-$(git -C /src rev-parse --short HEAD 2>/dev/null || echo unknown))}" && \
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
