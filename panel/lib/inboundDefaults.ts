/**
 * Default Xray inbound settings (JSON strings) for POST /panel/api/inbounds/add.
 * Matches structures used by the legacy web UI (x-ui style).
 */

export type InboundFormProtocol =
  | "vless"
  | "vmess"
  | "trojan"
  | "shadowsocks"
  | "mixed"
  | "hysteria"
  | "hysteria2";

function randomId(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
}

function randomSubId(): string {
  return randomId(16);
}

/** URL-safe / client password (trojan) */
function randomPassword(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newClientUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${randomId(8)}-${randomId(4)}-4${randomId(3)}-${randomId(4)}-${randomId(12)}`;
}

const defaultStreamTcp = {
  network: "tcp",
  security: "none",
  tcpSettings: {
    acceptProxyProtocol: false,
    header: { type: "none" },
  },
};

const defaultSniffing = {
  enabled: true,
  destOverride: ["http", "tls", "quic"],
};

export function defaultStreamSettingsString(): string {
  return JSON.stringify(defaultStreamTcp);
}

export function defaultSniffingString(): string {
  return JSON.stringify(defaultSniffing);
}

/** Sniffing as form fields (serialized to Xray sniffing JSON). */
export type SniffingFormState = {
  enabled: boolean;
  destHttp: boolean;
  destTls: boolean;
  destQuic: boolean;
  destFakedns: boolean;
};

export function defaultSniffingForm(): SniffingFormState {
  return {
    enabled: true,
    destHttp: true,
    destTls: true,
    destQuic: true,
    destFakedns: false,
  };
}

export function parseSniffingToForm(json: string): SniffingFormState {
  const base = defaultSniffingForm();
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    if (typeof root.enabled === "boolean") base.enabled = root.enabled;
    const ov = root.destOverride;
    if (Array.isArray(ov)) {
      const set = new Set(ov.filter((x) => typeof x === "string") as string[]);
      base.destHttp = set.has("http");
      base.destTls = set.has("tls");
      base.destQuic = set.has("quic");
      base.destFakedns = set.has("fakedns");
    }
  } catch {
    /* defaults */
  }
  return base;
}

export function buildSniffingFromForm(state: SniffingFormState): string {
  const destOverride: string[] = [];
  if (state.destHttp) destOverride.push("http");
  if (state.destTls) destOverride.push("tls");
  if (state.destQuic) destOverride.push("quic");
  if (state.destFakedns) destOverride.push("fakedns");
  return JSON.stringify({
    enabled: state.enabled,
    destOverride,
  });
}

/** Stream JSON for Hysteria / Hysteria2 inbounds (network hysteria). */
export function defaultStreamSettingsHysteriaString(version: 1 | 2): string {
  return JSON.stringify({
    network: "hysteria",
    security: "tls",
    tlsSettings: {
      alpn: ["h3"],
      minVersion: "1.2",
      certificates: [],
    },
    hysteriaSettings: {
      protocol: "hysteria",
      version,
      auth: "",
      udpIdleTimeout: 60,
    },
  });
}

export function streamPresetTcpTlsString(): string {
  return JSON.stringify({
    network: "tcp",
    security: "tls",
    tlsSettings: {
      alpn: ["http/1.1"],
      certificates: [],
      minVersion: "1.2",
      cipherSuites: "",
      preferServerCipherSuites: false,
    },
    tcpSettings: {
      acceptProxyProtocol: false,
      header: { type: "none" },
    },
  });
}

/** uTLS fingerprints (aligned with 3x-ui / Xray Reality). */
export const REALITY_FINGERPRINTS = [
  "chrome",
  "firefox",
  "safari",
  "ios",
  "android",
  "edge",
  "360",
  "qq",
  "random",
  "randomized",
  "randomizednoalpn",
  "unsafe",
] as const;

/** Structured stream / transport fields (non-hysteria); serialized to Xray streamSettings JSON. */
export type StreamFormState = {
  network: "tcp" | "ws" | "grpc" | "quic";
  security: "none" | "tls" | "reality";
  tcpHeaderType: "none" | "http";
  acceptProxyProtocol: boolean;
  /** QUIC transport (when network === quic) */
  quicSecurity: "none" | "aes-128-gcm" | "chacha20-poly1305";
  quicKey: string;
  quicHeaderType: "none" | "utp" | "wechat-video" | "dtls" | "wireguard" | "srtp";
  tlsServerName: string;
  tlsAlpn: string;
  tlsAllowInsecure: boolean;
  tlsMinVersion: "1.2" | "1.3";
  tlsCipherSuites: string;
  tlsCertificateFile: string;
  tlsKeyFile: string;
  /** Inline PEM (optional; used when file paths empty) */
  tlsCertificatePem: string;
  tlsKeyPem: string;
  wsPath: string;
  wsHost: string;
  grpcServiceName: string;
  hysteriaUdpIdleTimeout: number;
  /** REALITY (security === reality); matches 3x-ui RealityStreamSettings.toJson */
  realityShow: boolean;
  realityXver: number;
  realityTarget: string;
  realityServerNames: string;
  realityPrivateKey: string;
  realityMinClientVer: string;
  realityMaxClientVer: string;
  realityMaxTimeDiff: number;
  realityShortIds: string;
  realityMldsa65Seed: string;
  realityPublicKey: string;
  realityFingerprint: string;
  realitySettingsServerName: string;
  realitySpiderX: string;
  realityMldsa65Verify: string;
};

export function defaultStreamForm(): StreamFormState {
  return {
    network: "tcp",
    security: "none",
    tcpHeaderType: "none",
    acceptProxyProtocol: false,
    quicSecurity: "none",
    quicKey: "",
    quicHeaderType: "none",
    tlsServerName: "",
    tlsAlpn: "http/1.1",
    tlsAllowInsecure: false,
    tlsMinVersion: "1.2",
    tlsCipherSuites: "",
    tlsCertificateFile: "",
    tlsKeyFile: "",
    tlsCertificatePem: "",
    tlsKeyPem: "",
    wsPath: "/",
    wsHost: "",
    grpcServiceName: "",
    hysteriaUdpIdleTimeout: 60,
    realityShow: false,
    realityXver: 0,
    realityTarget: "www.apple.com:443",
    realityServerNames: "www.apple.com,apple.com",
    realityPrivateKey: "",
    realityMinClientVer: "",
    realityMaxClientVer: "",
    realityMaxTimeDiff: 0,
    realityShortIds: "",
    realityMldsa65Seed: "",
    realityPublicKey: "",
    realityFingerprint: "chrome",
    realitySettingsServerName: "",
    realitySpiderX: "/",
    realityMldsa65Verify: "",
  };
}

function pemToCertArray(pem: string): string[] {
  const t = pem.trim();
  if (!t) return [];
  return t.split("\n").map((l) => l.trimEnd());
}

function certArrayToPem(lines: unknown): string {
  if (typeof lines === "string") return lines;
  if (!Array.isArray(lines)) return "";
  return lines.filter((x) => typeof x === "string").join("\n");
}

function isQuicHeaderType(s: string): s is StreamFormState["quicHeaderType"] {
  return (
    s === "none" ||
    s === "utp" ||
    s === "wechat-video" ||
    s === "dtls" ||
    s === "wireguard" ||
    s === "srtp"
  );
}

function alpnToString(alpn: unknown): string {
  if (!Array.isArray(alpn)) return "http/1.1";
  return alpn.filter((x) => typeof x === "string").join(", ");
}

function parseHeaderType(tcp: Record<string, unknown> | undefined): "none" | "http" {
  const header = tcp?.header as Record<string, unknown> | undefined;
  const ty = header?.type;
  return ty === "http" ? "http" : "none";
}

/** How the inbound transport editor maps to streamSettings (UI varies by protocol). */
export type InboundStreamTransportMode = "hysteria" | "shadowsocks" | "full";

export function getInboundStreamTransportMode(
  protocol: InboundFormProtocol,
): InboundStreamTransportMode {
  if (protocol === "hysteria" || protocol === "hysteria2") return "hysteria";
  /** TCP/WS, stream security none — same editor for SS and mixed (HTTP+SOCKS proxy). */
  if (protocol === "shadowsocks" || protocol === "mixed") return "shadowsocks";
  return "full";
}

/**
 * Shadowsocks: only TCP or WebSocket, stream security is always "none" (SS has its own crypto).
 * TLS/REALITY apply to VLESS/VMess/Trojan, not this protocol — ignore if present in saved JSON.
 */
function parseStreamSettingsShadowsocksForm(json: string): StreamFormState {
  const base = defaultStreamForm();
  base.security = "none";
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const net = root.network;
    base.network = net === "ws" ? "ws" : "tcp";
    const tcp = root.tcpSettings as Record<string, unknown> | undefined;
    if (tcp) {
      base.acceptProxyProtocol = tcp.acceptProxyProtocol === true;
      base.tcpHeaderType = parseHeaderType(tcp);
    }
    const ws = root.wsSettings as Record<string, unknown> | undefined;
    if (ws) {
      if (typeof ws.path === "string") base.wsPath = ws.path;
      const headers = ws.headers as Record<string, unknown> | undefined;
      const host = headers?.Host ?? headers?.host;
      if (typeof host === "string") base.wsHost = host;
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

function buildStreamSettingsShadowsocksFromForm(state: StreamFormState): string {
  const net = state.network === "ws" ? "ws" : "tcp";
  const out: Record<string, unknown> = {
    network: net,
    security: "none",
  };
  if (net === "tcp") {
    out.tcpSettings = {
      acceptProxyProtocol: state.acceptProxyProtocol,
      header: { type: state.tcpHeaderType },
    };
  } else {
    const headers: Record<string, string> = {};
    if (state.wsHost.trim()) {
      headers.Host = state.wsHost.trim();
    }
    out.wsSettings = {
      path: state.wsPath.trim() || "/",
      headers,
    };
  }
  return JSON.stringify(out);
}

/** Preset: Shadowsocks + WebSocket (no stream TLS). */
export function streamPresetShadowsocksWsString(): string {
  return JSON.stringify({
    network: "ws",
    security: "none",
    wsSettings: {
      path: "/",
      headers: {},
    },
  });
}

/** Map existing streamSettings JSON into form state. Best-effort for tcp/ws/grpc + tls. */
export function parseStreamSettingsToForm(
  json: string,
  protocol: InboundFormProtocol,
): StreamFormState {
  const base = defaultStreamForm();
  if (protocol === "hysteria" || protocol === "hysteria2") {
    try {
      const root = JSON.parse(json) as Record<string, unknown>;
      const hy = root.hysteriaSettings as Record<string, unknown> | undefined;
      const timeout = hy?.udpIdleTimeout;
      if (typeof timeout === "number" && timeout > 0) {
        base.hysteriaUdpIdleTimeout = Math.round(timeout);
      }
    } catch {
      /* keep defaults */
    }
    return base;
  }
  if (protocol === "shadowsocks" || protocol === "mixed") {
    return parseStreamSettingsShadowsocksForm(json);
  }
  try {
    const root = JSON.parse(json) as Record<string, unknown>;
    const net = root.network;
    if (net === "ws" || net === "grpc" || net === "tcp" || net === "quic") {
      base.network = net;
    }
    const sec = root.security;
    if (sec === "tls" || sec === "none" || sec === "reality") {
      base.security = sec;
    }
    const rs = root.realitySettings as Record<string, unknown> | undefined;
    if (rs && typeof rs === "object" && !Array.isArray(rs)) {
      base.security = "reality";
      if (typeof rs.show === "boolean") base.realityShow = rs.show;
      if (typeof rs.xver === "number" && rs.xver >= 0) base.realityXver = rs.xver;
      const tgt = rs.target ?? rs.dest;
      if (typeof tgt === "string") base.realityTarget = tgt;
      if (Array.isArray(rs.serverNames)) {
        base.realityServerNames = rs.serverNames
          .filter((x): x is string => typeof x === "string")
          .join(",");
      } else if (typeof rs.serverNames === "string") {
        base.realityServerNames = rs.serverNames;
      }
      if (typeof rs.privateKey === "string") base.realityPrivateKey = rs.privateKey;
      if (typeof rs.minClientVer === "string") base.realityMinClientVer = rs.minClientVer;
      if (typeof rs.maxClientVer === "string") base.realityMaxClientVer = rs.maxClientVer;
      const mtd = rs.maxTimediff ?? rs.maxTimeDiff;
      if (typeof mtd === "number" && mtd >= 0) base.realityMaxTimeDiff = mtd;
      if (Array.isArray(rs.shortIds)) {
        base.realityShortIds = rs.shortIds
          .filter((x): x is string => typeof x === "string")
          .join(",");
      } else if (typeof rs.shortIds === "string") {
        base.realityShortIds = rs.shortIds;
      }
      if (typeof rs.mldsa65Seed === "string") base.realityMldsa65Seed = rs.mldsa65Seed;
      const rst = rs.settings as Record<string, unknown> | undefined;
      if (rst && typeof rst === "object") {
        if (typeof rst.publicKey === "string") base.realityPublicKey = rst.publicKey;
        if (typeof rst.fingerprint === "string") base.realityFingerprint = rst.fingerprint;
        if (typeof rst.serverName === "string") base.realitySettingsServerName = rst.serverName;
        if (typeof rst.spiderX === "string") base.realitySpiderX = rst.spiderX;
        if (typeof rst.mldsa65Verify === "string") base.realityMldsa65Verify = rst.mldsa65Verify;
      }
    }
    const tcp = root.tcpSettings as Record<string, unknown> | undefined;
    if (tcp) {
      base.acceptProxyProtocol = tcp.acceptProxyProtocol === true;
      base.tcpHeaderType = parseHeaderType(tcp);
    }
    const ws = root.wsSettings as Record<string, unknown> | undefined;
    if (ws) {
      if (typeof ws.path === "string") base.wsPath = ws.path;
      const headers = ws.headers as Record<string, unknown> | undefined;
      const host = headers?.Host ?? headers?.host;
      if (typeof host === "string") base.wsHost = host;
    }
    const grpc = root.grpcSettings as Record<string, unknown> | undefined;
    if (grpc && typeof grpc.serviceName === "string") {
      base.grpcServiceName = grpc.serviceName;
    }
    const quic = root.quicSettings as Record<string, unknown> | undefined;
    if (quic) {
      const qs = quic.security;
      if (qs === "aes-128-gcm" || qs === "chacha20-poly1305" || qs === "none") {
        base.quicSecurity = qs;
      }
      if (typeof quic.key === "string") base.quicKey = quic.key;
      const qh = quic.header as Record<string, unknown> | undefined;
      const qht = qh?.type;
      if (typeof qht === "string" && isQuicHeaderType(qht)) {
        base.quicHeaderType = qht;
      }
    }
    if (base.security === "tls") {
      const tls = root.tlsSettings as Record<string, unknown> | undefined;
      if (tls) {
        if (typeof tls.serverName === "string") base.tlsServerName = tls.serverName;
        base.tlsAlpn = alpnToString(tls.alpn);
        if (tls.allowInsecure === true) base.tlsAllowInsecure = true;
        const mv = tls.minVersion;
        if (mv === "1.3" || mv === "1.2") base.tlsMinVersion = mv;
        if (typeof tls.cipherSuites === "string") {
          base.tlsCipherSuites = tls.cipherSuites;
        }
        const certs = tls.certificates;
        if (Array.isArray(certs) && certs.length > 0 && typeof certs[0] === "object" && certs[0] !== null) {
          const c0 = certs[0] as Record<string, unknown>;
          if (typeof c0.certificateFile === "string") {
            base.tlsCertificateFile = c0.certificateFile;
          }
          if (typeof c0.keyFile === "string") {
            base.tlsKeyFile = c0.keyFile;
          }
          if (c0.certificate != null) {
            base.tlsCertificatePem = certArrayToPem(c0.certificate);
          }
          if (c0.key != null) {
            base.tlsKeyPem = certArrayToPem(c0.key);
          }
        }
      }
    }
  } catch {
    /* defaults */
  }
  return base;
}

/** Build streamSettings JSON string from structured form (and protocol). */
export function buildStreamSettingsFromForm(
  state: StreamFormState,
  protocol: InboundFormProtocol,
): string {
  if (protocol === "hysteria") {
    return JSON.stringify({
      network: "hysteria",
      security: "tls",
      tlsSettings: {
        alpn: ["h3"],
        minVersion: "1.2",
        certificates: [],
      },
      hysteriaSettings: {
        protocol: "hysteria",
        version: 1,
        auth: "",
        udpIdleTimeout: Math.max(1, Math.round(state.hysteriaUdpIdleTimeout) || 60),
      },
    });
  }
  if (protocol === "hysteria2") {
    return JSON.stringify({
      network: "hysteria",
      security: "tls",
      tlsSettings: {
        alpn: ["h3"],
        minVersion: "1.2",
        certificates: [],
      },
      hysteriaSettings: {
        protocol: "hysteria",
        version: 2,
        auth: "",
        udpIdleTimeout: Math.max(1, Math.round(state.hysteriaUdpIdleTimeout) || 60),
      },
    });
  }
  if (protocol === "shadowsocks" || protocol === "mixed") {
    return buildStreamSettingsShadowsocksFromForm(state);
  }

  const out: Record<string, unknown> = {
    network: state.network,
    security: state.security,
  };

  if (state.network === "tcp") {
    out.tcpSettings = {
      acceptProxyProtocol: state.acceptProxyProtocol,
      header: { type: state.tcpHeaderType },
    };
  } else if (state.network === "ws") {
    const headers: Record<string, string> = {};
    if (state.wsHost.trim()) {
      headers.Host = state.wsHost.trim();
    }
    out.wsSettings = {
      path: state.wsPath.trim() || "/",
      headers,
    };
  } else if (state.network === "grpc") {
    out.grpcSettings = {
      serviceName: state.grpcServiceName.trim(),
      multiMode: false,
    };
  } else if (state.network === "quic") {
    out.quicSettings = {
      security: state.quicSecurity,
      key: state.quicKey.trim(),
      header: { type: state.quicHeaderType },
    };
  }

  if (state.security === "reality") {
    const serverNames = state.realityServerNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const shortParts = state.realityShortIds.split(",").map((s) => s.trim());
    const shortIds =
      state.realityShortIds.trim() === "" ? [""] : shortParts.length > 0 ? shortParts : [""];
    out.realitySettings = {
      show: state.realityShow,
      xver: Math.max(0, Math.round(Number(state.realityXver)) || 0),
      target: state.realityTarget.trim(),
      serverNames: serverNames.length > 0 ? serverNames : [""],
      privateKey: state.realityPrivateKey.trim(),
      minClientVer: state.realityMinClientVer.trim(),
      maxClientVer: state.realityMaxClientVer.trim(),
      maxTimediff: Math.max(0, Math.round(Number(state.realityMaxTimeDiff)) || 0),
      shortIds,
      mldsa65Seed: state.realityMldsa65Seed.trim(),
      settings: {
        publicKey: state.realityPublicKey.trim(),
        fingerprint: (state.realityFingerprint || "chrome").trim(),
        serverName: state.realitySettingsServerName.trim(),
        spiderX: (state.realitySpiderX.trim() || "/"),
        mldsa65Verify: state.realityMldsa65Verify.trim(),
      },
    };
  } else if (state.security === "tls") {
    const alpn = state.tlsAlpn
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const certFile = state.tlsCertificateFile.trim();
    const keyFile = state.tlsKeyFile.trim();
    const pemCert = state.tlsCertificatePem.trim();
    const pemKey = state.tlsKeyPem.trim();
    let certificates: unknown[] = [];
    if (certFile && keyFile) {
      certificates = [
        {
          certificateFile: certFile,
          keyFile,
        },
      ];
    } else if (pemCert && pemKey) {
      certificates = [
        {
          certificate: pemToCertArray(pemCert),
          key: pemToCertArray(pemKey),
        },
      ];
    } else if (certFile || keyFile || pemCert || pemKey) {
      certificates = [
        {
          certificateFile: certFile,
          keyFile,
          certificate: pemCert ? pemToCertArray(pemCert) : [],
          key: pemKey ? pemToCertArray(pemKey) : [],
        },
      ];
    }
    out.tlsSettings = {
      serverName: state.tlsServerName.trim(),
      alpn: alpn.length > 0 ? alpn : ["http/1.1"],
      allowInsecure: state.tlsAllowInsecure,
      minVersion: state.tlsMinVersion,
      certificates,
      cipherSuites: state.tlsCipherSuites.trim(),
      preferServerCipherSuites: false,
    };
  }

  return JSON.stringify(out);
}

export type FirstClientPatch = {
  clientEmail: string;
  vlessFlow: string;
  trojanPassword: string;
  hysteriaAuth: string;
  ssMethod: string;
  ssPassword: string;
  /** Xray mixed inbound: SOCKS/HTTP account user (maps to accounts[].user). */
  mixedUser?: string;
  mixedPassword?: string;
};

export function buildSettingsJson(
  protocol: InboundFormProtocol,
  opts: FirstClientPatch,
): string {
  const email = opts.clientEmail.trim() || `user-${randomId(8)}@inbound.local`;
  const subId = randomSubId();
  const now = Date.now();

  switch (protocol) {
    case "vless": {
      const o = {
        clients: [
          {
            id: newClientUUID(),
            flow: opts.vlessFlow.trim(),
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: "",
            subId,
            comment: "",
            reset: 0,
            created_at: now,
            updated_at: now,
          },
        ],
        decryption: "none",
        fallbacks: [],
      };
      return JSON.stringify(o);
    }
    case "vmess": {
      const o = {
        clients: [
          {
            id: newClientUUID(),
            security: "auto",
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: "",
            subId,
            comment: "",
            reset: 0,
            created_at: now,
            updated_at: now,
          },
        ],
        disableInsecureEncryption: false,
      };
      return JSON.stringify(o);
    }
    case "trojan": {
      const password = opts.trojanPassword.trim() || randomPassword(12);
      const o = {
        clients: [
          {
            password,
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: "",
            subId,
            comment: "",
            reset: 0,
            created_at: now,
            updated_at: now,
          },
        ],
        fallbacks: [],
      };
      return JSON.stringify(o);
    }
    case "hysteria":
    case "hysteria2": {
      const version = protocol === "hysteria2" ? 2 : 1;
      const auth = opts.hysteriaAuth.trim() || randomPassword(8);
      const o = {
        version,
        clients: [
          {
            auth,
            password: auth,
            email,
            limitIp: 0,
            totalGB: 0,
            expiryTime: 0,
            enable: true,
            tgId: "",
            subId,
            comment: "",
            reset: 0,
            created_at: now,
            updated_at: now,
          },
        ],
      };
      return JSON.stringify(o);
    }
    case "shadowsocks": {
      const o = {
        method: opts.ssMethod || "aes-256-gcm",
        password: opts.ssPassword.trim() || randomPassword(12),
        network: "tcp,udp",
        clients: [],
        ivCheck: false,
      };
      return JSON.stringify(o);
    }
    case "mixed": {
      const user = (opts.mixedUser || "proxy").trim() || "proxy";
      const pass = (opts.mixedPassword ?? "").trim() || randomPassword(12);
      return JSON.stringify({
        auth: "password",
        accounts: [{ user, pass }],
        udp: true,
      });
    }
    default:
      return "{}";
  }
}

/** Bytes → GB string for form (3 decimal max). */
export function totalBytesToGbInput(totalBytes: number): string {
  if (!totalBytes || totalBytes <= 0) return "0";
  const gb = totalBytes / (1024 * 1024 * 1024);
  return String(Math.round(gb * 1000) / 1000);
}

/** Parse settings JSON and read first client fields for the inbound form. */
export function parseFirstClientFromSettings(
  settingsStr: string,
  protocol: InboundFormProtocol,
): Partial<FirstClientPatch> {
  try {
    const root = JSON.parse(settingsStr) as Record<string, unknown>;
    if (protocol === "mixed") {
      const out: Partial<FirstClientPatch> = {};
      const acc = root.accounts;
      if (Array.isArray(acc) && acc.length > 0) {
        const a0 = acc[0] as Record<string, unknown>;
        if (typeof a0.user === "string") out.mixedUser = a0.user;
        if (typeof a0.pass === "string") out.mixedPassword = a0.pass;
      }
      return out;
    }
    const clients = root.clients;
    if (!Array.isArray(clients) || clients.length === 0) {
      return {};
    }
    const c = clients[0] as Record<string, unknown>;
    const out: Partial<FirstClientPatch> = {};
    if (typeof c.email === "string") out.clientEmail = c.email;
    if (typeof c.flow === "string") out.vlessFlow = c.flow;
    if (typeof c.password === "string") out.trojanPassword = c.password;
    if (typeof c.auth === "string") out.hysteriaAuth = c.auth;
    else if (typeof c.password === "string" && (protocol === "hysteria" || protocol === "hysteria2"))
      out.hysteriaAuth = c.password;
    if (typeof root.method === "string") out.ssMethod = root.method;
    if (typeof root.password === "string") out.ssPassword = root.password;
    return out;
  } catch {
    return {};
  }
}

/**
 * Merge form client fields into existing settings JSON (for edit).
 * Preserves non-first clients and non-client keys.
 */
export function mergeFirstClientIntoSettings(
  settingsStr: string,
  protocol: InboundFormProtocol,
  patch: FirstClientPatch,
): string {
  let root: Record<string, unknown> = {};
  try {
    root = JSON.parse(settingsStr) as Record<string, unknown>;
  } catch {
    root = {};
  }
  const now = Date.now();

  if (protocol === "shadowsocks") {
    root.method = patch.ssMethod || "aes-256-gcm";
    root.password = patch.ssPassword.trim() || randomPassword(12);
    if (!Array.isArray(root.clients)) root.clients = [];
    return JSON.stringify(root);
  }

  if (protocol === "mixed") {
    const user = (patch.mixedUser || "proxy").trim() || "proxy";
    const pass = (patch.mixedPassword ?? "").trim() || randomPassword(12);
    root.auth = "password";
    root.accounts = [{ user, pass }];
    root.udp = true;
    delete root.clients;
    return JSON.stringify(root);
  }

  let clients = Array.isArray(root.clients) ? [...root.clients] : [];
  const first =
    clients.length > 0 && typeof clients[0] === "object" && clients[0] !== null
      ? { ...(clients[0] as Record<string, unknown>) }
      : {};

  const existingEmail =
    typeof first.email === "string" && first.email.trim()
      ? first.email.trim()
      : "";
  const email =
    patch.clientEmail.trim() ||
    existingEmail ||
    `user-${randomId(8)}@inbound.local`;

  first.email = email;
  first.enable = first.enable !== false;
  if (first.created_at == null) first.created_at = now;
  first.updated_at = now;

  switch (protocol) {
    case "vless":
      first.id = typeof first.id === "string" && first.id ? first.id : newClientUUID();
      first.flow = patch.vlessFlow.trim();
      break;
    case "vmess":
      first.id = typeof first.id === "string" && first.id ? first.id : newClientUUID();
      first.security = typeof first.security === "string" ? first.security : "auto";
      break;
    case "trojan": {
      const pw = patch.trojanPassword.trim() || randomPassword(12);
      first.password = pw;
      break;
    }
    case "hysteria":
    case "hysteria2": {
      const auth = patch.hysteriaAuth.trim() || randomPassword(8);
      first.auth = auth;
      first.password = auth;
      root.version = protocol === "hysteria2" ? 2 : 1;
      break;
    }
    default:
      break;
  }

  clients = [first, ...clients.slice(1)];
  root.clients = clients;
  return JSON.stringify(root);
}

function randomHexSeq(len: number): string {
  const arr = new Uint8Array(Math.ceil(len / 2));
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i += 1) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, len);
}

/** Comma-separated Reality shortIds (same idea as legacy RandomUtil.randomShortIds). */
export function randomRealityShortIds(): string {
  const lengths = [2, 4, 6, 8, 10, 12, 14, 16]
    .map((x) => ({ x, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ x }) => x);
  return lengths.map((len) => randomHexSeq(len)).join(",");
}

/** Key material for QUIC when encryption is enabled (hex). */
export function randomQuicKey(): string {
  return randomHexSeq(32);
}

/** Host part of `host:port` or full string if no port. Supports IPv6 `[addr]:port`. */
export function hostFromRealityTarget(target: string): string {
  const t = target.trim();
  if (!t) return "";
  if (t.startsWith("[")) {
    const end = t.indexOf("]");
    if (end > 1 && t.slice(end + 1).startsWith(":")) {
      return t.slice(1, end);
    }
  }
  const colon = t.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(t.slice(colon + 1))) {
    return t.slice(0, colon);
  }
  return t;
}

/** Random WebSocket path segment, e.g. `/a1b2c3d4`. */
export function randomWsPath(): string {
  return `/${randomHexSeq(8)}`;
}

/**
 * Random TLS SNI-style hostname: random label + base domain from ws host, TLS SNI, or example.com.
 */
export function suggestRandomTlsSni(wsHost: string, tlsServerName: string): string {
  const pick =
    hostFromRealityTarget(wsHost.trim()) ||
    hostFromRealityTarget(tlsServerName.trim()) ||
    "example.com";
  const label = randomHexSeq(6);
  return `${label}.${pick.replace(/^\.+/, "")}`;
}

export { randomPassword };
