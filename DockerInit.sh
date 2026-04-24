#!/bin/sh
# $1: Docker BuildKit TARGETARCH (amd64, arm64, arm, 386, ...). If empty, match host/emu arch so
# the downloaded binary name matches runtime.GOOS/GOARCH (e.g. xray-linux-arm64 on linux/arm64).
RESOLVED="${1:-}"
if [ -z "$RESOLVED" ]; then
    case "$(uname -m)" in
        x86_64)  RESOLVED=amd64 ;;
        i386|i486|i686) RESOLVED=386 ;;
        aarch64) RESOLVED=arm64 ;;
        armv7l)  RESOLVED=arm ;;
        armv6l)  RESOLVED=armv6 ;;
        *)       RESOLVED=amd64 ;;
    esac
    echo "DockerInit: TARGETARCH empty, using uname -> ${RESOLVED}"
fi

case $RESOLVED in
    amd64)
        ARCH="64"
        FNAME="amd64"
        ;;
    386|i386)
        ARCH="32"
        FNAME="i386"
        ;;
    armv8|arm64|aarch64)
        ARCH="arm64-v8a"
        FNAME="arm64"
        ;;
    armv7|arm|arm32)
        ARCH="arm32-v7a"
        FNAME="arm32"
        ;;
    armv6)
        ARCH="arm32-v6"
        FNAME="armv6"
        ;;
    *)
        echo "DockerInit: unknown arch '$RESOLVED', defaulting to amd64"
        ARCH="64"
        FNAME="amd64"
        ;;
esac
echo "DockerInit: downloading Xray for ${RESOLVED} (zip ARCH=${ARCH}, output xray-linux-${FNAME})"
mkdir -p build/bin
cd build/bin
curl -sfLRO "https://github.com/XTLS/Xray-core/releases/download/v26.3.27/Xray-linux-${ARCH}.zip"
unzip "Xray-linux-${ARCH}.zip"
rm -f "Xray-linux-${ARCH}.zip" geoip.dat geosite.dat
mv xray "xray-linux-${FNAME}"
chmod +x "xray-linux-${FNAME}"
echo "DockerInit: rules 1/6 — Loyalsoldier geoip.dat (large, may take minutes)..."
curl -sfLRO https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geoip.dat
echo "DockerInit: rules 2/6 — Loyalsoldier geosite.dat..."
curl -sfLRO https://github.com/Loyalsoldier/v2ray-rules-dat/releases/latest/download/geosite.dat
echo "DockerInit: rules 3/6 — IR geoip..."
curl -sfLRo geoip_IR.dat https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geoip.dat
echo "DockerInit: rules 4/6 — IR geosite..."
curl -sfLRo geosite_IR.dat https://github.com/chocolate4u/Iran-v2ray-rules/releases/latest/download/geosite.dat
echo "DockerInit: rules 5/6 — RU geoip..."
curl -sfLRo geoip_RU.dat https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geoip.dat
echo "DockerInit: rules 6/6 — RU geosite..."
curl -sfLRo geosite_RU.dat https://github.com/runetfreedom/russia-v2ray-rules-dat/releases/latest/download/geosite.dat
echo "DockerInit: done."
cd ../../