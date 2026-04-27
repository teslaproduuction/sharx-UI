/**
 * Client routing profile JSON (Happ-style shape) and deep links.
 * Link form: `{prefix}{base64(UTF-8 JSON)}` where prefix is typically `…://routing/add/`
 * (e.g. happ, incy, sharx, or a custom URL prefix). Built locally by
 * `routingConfigToDeepLink` — no external link builder.
 */

export type HappStringBool = "true" | "false";

export type HappRoutingConfig = {
  Name: string;
  GlobalProxy: HappStringBool;
  RouteOrder: string;
  RemoteDNSType: string;
  RemoteDNSDomain: string;
  RemoteDNSIP: string;
  DomesticDNSType: string;
  DomesticDNSDomain: string;
  DomesticDNSIP: string;
  Geoipurl: string;
  Geositeurl: string;
  LastUpdated: string;
  DnsHosts: Record<string, string>;
  DirectSites: string[];
  DirectIp: string[];
  ProxySites: string[];
  ProxyIp: string[];
  BlockSites: string[];
  BlockIp: string[];
  DomainStrategy: string;
  FakeDNS: HappStringBool;
  UseChunkFiles: HappStringBool;
};

export function defaultHappRoutingConfig(): HappRoutingConfig {
  return {
    Name: "",
    GlobalProxy: "true",
    RouteOrder: "block-proxy-direct",
    RemoteDNSType: "DoH",
    RemoteDNSDomain: "",
    RemoteDNSIP: "",
    DomesticDNSType: "DoU",
    DomesticDNSDomain: "",
    DomesticDNSIP: "",
    Geoipurl: "",
    Geositeurl: "",
    LastUpdated: "",
    DnsHosts: {},
    DirectSites: [],
    DirectIp: [],
    ProxySites: [],
    ProxyIp: [],
    BlockSites: [],
    BlockIp: [],
    DomainStrategy: "IPIfNonMatch",
    FakeDNS: "false",
    UseChunkFiles: "true",
  };
}

function toHappStringBool(v: unknown): HappStringBool {
  if (v === true || v === "true" || v === 1 || v === "1") return "true";
  return "false";
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === "string" ? x : String(x))).filter(Boolean);
}

function asDnsHosts(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const key = String(k).trim();
    if (!key) continue;
    out[key] = val == null ? "" : String(val);
  }
  return out;
}

/** Merge parsed JSON into a full HappRoutingConfig with safe defaults. */
export function normalizeHappRoutingConfig(raw: unknown): HappRoutingConfig {
  const d = defaultHappRoutingConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  return {
    Name: o.Name != null ? String(o.Name) : d.Name,
    GlobalProxy: toHappStringBool(o.GlobalProxy ?? d.GlobalProxy),
    RouteOrder: o.RouteOrder != null ? String(o.RouteOrder) : d.RouteOrder,
    RemoteDNSType: o.RemoteDNSType != null ? String(o.RemoteDNSType) : d.RemoteDNSType,
    RemoteDNSDomain: o.RemoteDNSDomain != null ? String(o.RemoteDNSDomain) : d.RemoteDNSDomain,
    RemoteDNSIP: o.RemoteDNSIP != null ? String(o.RemoteDNSIP) : d.RemoteDNSIP,
    DomesticDNSType: o.DomesticDNSType != null ? String(o.DomesticDNSType) : d.DomesticDNSType,
    DomesticDNSDomain: o.DomesticDNSDomain != null ? String(o.DomesticDNSDomain) : d.DomesticDNSDomain,
    DomesticDNSIP: o.DomesticDNSIP != null ? String(o.DomesticDNSIP) : d.DomesticDNSIP,
    Geoipurl: o.Geoipurl != null ? String(o.Geoipurl) : d.Geoipurl,
    Geositeurl: o.Geositeurl != null ? String(o.Geositeurl) : d.Geositeurl,
    LastUpdated: o.LastUpdated != null ? String(o.LastUpdated) : d.LastUpdated,
    DnsHosts: { ...d.DnsHosts, ...asDnsHosts(o.DnsHosts) },
    DirectSites: asStringArray(o.DirectSites),
    DirectIp: asStringArray(o.DirectIp),
    ProxySites: asStringArray(o.ProxySites),
    ProxyIp: asStringArray(o.ProxyIp),
    BlockSites: asStringArray(o.BlockSites),
    BlockIp: asStringArray(o.BlockIp),
    DomainStrategy: o.DomainStrategy != null ? String(o.DomainStrategy) : d.DomainStrategy,
    FakeDNS: toHappStringBool(o.FakeDNS ?? d.FakeDNS),
    UseChunkFiles: toHappStringBool(o.UseChunkFiles ?? d.UseChunkFiles),
  };
}

export function happConfigToJsonText(cfg: HappRoutingConfig, pretty: boolean): string {
  return pretty ? JSON.stringify(cfg, null, 2) : JSON.stringify(cfg);
}

export function parseHappConfigJsonText(text: string): HappRoutingConfig | null {
  const t = text.trim();
  if (!t) return null;
  try {
    const parsed = JSON.parse(t) as unknown;
    return normalizeHappRoutingConfig(parsed);
  } catch {
    return null;
  }
}

/** Built-in presets: prefix must end before the Base64 JSON payload. */
export const ROUTING_DEEPLINK_BUILTIN_PREFIX = {
  happ: "happ://routing/add/",
  incy: "incy://routing/add/",
  sharx: "sharx://routing/add/",
} as const;

export type RoutingDeepLinkBuiltin = keyof typeof ROUTING_DEEPLINK_BUILTIN_PREFIX;

export type RoutingDeepLinkPreset = RoutingDeepLinkBuiltin | "custom";

export function getRoutingDeepLinkPrefix(
  preset: RoutingDeepLinkPreset,
  customPrefix: string,
): string {
  if (preset === "custom") {
    const t = customPrefix.trim();
    if (!t) return ROUTING_DEEPLINK_BUILTIN_PREFIX.happ;
    return t.endsWith("/") ? t : `${t}/`;
  }
  return ROUTING_DEEPLINK_BUILTIN_PREFIX[preset];
}

const LEGACY_HAPP_PREFIX = ROUTING_DEEPLINK_BUILTIN_PREFIX.happ;

function utf8ToBase64(s: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(s)));
  }
  return Buffer.from(s, "utf-8").toString("base64");
}

function base64ToUtf8(b64: string): string {
  const pad = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  if (typeof atob === "function") {
    const bin = atob(pad.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return Buffer.from(pad, "base64").toString("utf-8");
}

/** Build `scheme://routing/add/{base64}` (or custom prefix + payload). */
export function routingConfigToDeepLink(cfg: HappRoutingConfig, prefix: string): string {
  const json = JSON.stringify(cfg);
  const p = prefix.trim() ? (prefix.endsWith("/") ? prefix : `${prefix}/`) : LEGACY_HAPP_PREFIX;
  return p + utf8ToBase64(json);
}

export function happRoutingToDeepLink(cfg: HappRoutingConfig): string {
  return routingConfigToDeepLink(cfg, LEGACY_HAPP_PREFIX);
}

/** Decode Base64 segment after `/routing/add/` (UTF-8 JSON). */
export function decodeHappRoutingPayload(b64: string): HappRoutingConfig | null {
  const t = b64.trim();
  if (!t) return null;
  try {
    const json = base64ToUtf8(t);
    const parsed = JSON.parse(json) as unknown;
    return normalizeHappRoutingConfig(parsed);
  } catch {
    return null;
  }
}

/**
 * Extract Base64 (or URL-encoded) payload from any supported deep link.
 * Matches `://routing/add/<payload>` (Happ / Incy / SharX) or `/routing/add/<payload>` in path.
 */
export function extractPayloadFromRoutingDeepLink(text: string): string | null {
  const s = text.trim();
  const m1 = s.match(/:[/][/]routing[/]add[/]([^/?#\s]+)/i);
  if (m1?.[1]) {
    try {
      return decodeURIComponent(m1[1]);
    } catch {
      return m1[1];
    }
  }
  const m2 = s.match(/\/routing\/add\/([^/?#\s]+)/i);
  if (m2?.[1]) {
    try {
      return decodeURIComponent(m2[1]);
    } catch {
      return m2[1];
    }
  }
  return null;
}

/**
 * Import: full deep link (any scheme with routing/add), raw base64, or JSON object text.
 */
export function importRoutingSnippet(text: string): HappRoutingConfig | null {
  let s = text.trim();
  if (!s) return null;

  const extracted = extractPayloadFromRoutingDeepLink(s);
  if (extracted) s = extracted;
  else if (s.toLowerCase().startsWith(LEGACY_HAPP_PREFIX)) {
    s = s.slice(LEGACY_HAPP_PREFIX.length).trim();
  } else if (/^happ:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const path = u.pathname.replace(/^\//, "");
      if (path) s = path;
    } catch {
      /* use as-is */
    }
  }

  const fromB64 = decodeHappRoutingPayload(s);
  if (fromB64) return fromB64;

  return parseHappConfigJsonText(s);
}

/** Alias for {@link importRoutingSnippet}. */
export const importHappRoutingSnippet = importRoutingSnippet;

export function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function listToLines(items: string[]): string {
  return items.join("\n");
}

export function parseDnsHostsText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of linesToList(text)) {
    const tab = line.indexOf("\t");
    const sp = line.indexOf(" ");
    let sep = -1;
    if (tab >= 0 && sp >= 0) sep = Math.min(tab, sp);
    else sep = Math.max(tab, sp);
    if (sep <= 0) continue;
    const host = line.slice(0, sep).trim();
    const ip = line.slice(sep + 1).trim();
    if (host && ip) out[host] = ip;
  }
  return out;
}

export function dnsHostsToText(hosts: Record<string, string>): string {
  return Object.entries(hosts)
    .map(([h, ip]) => `${h}\t${ip}`)
    .join("\n");
}
