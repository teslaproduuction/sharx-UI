import type { SharxSubpageConfig } from "@/lib/sharxSubpageConfig";

export type PublicSubUser = {
  shortUuid: string;
  username?: string;
  daysLeft: number;
  trafficUsed: string;
  trafficLimit: string;
  expiresAt: string;
  isActive: boolean;
  userStatus: string;
  /** True when the VPN session is in Xray's current online set (not the same as account ACTIVE). */
  isOnline?: boolean;
};

export type PublicSubPayload = {
  config: SharxSubpageConfig | Record<string, unknown>;
  configUuid: string;
  /** Raw subscription feed URL (e.g. /sub/...) for VPN apps. */
  subscriptionUrl: string;
  /** Optional HTML subscription landing page when it differs from subscriptionUrl. */
  subscriptionPageUrl?: string;
  subscriptionJsonUrl: string;
  links: string[];
  user: PublicSubUser;
  /** Optional deep-link URL for Happ (happ://crypt4/...). */
  happEncryptedUrl?: string;
  /** Optional deep-link URL for v2rayTun (v2raytun://crypt/...). */
  v2raytunEncryptedUrl?: string;
  /**
   * Telemt MTProto share links (tg://proxy?...) for the HTML page only.
   * Not included in the raw VPN subscription feed (`links`).
   */
  mtProtoLinks?: string[];
};

export type SupportKind = "telegram" | "discord" | "vk" | "generic";

export function supportKindFromUrl(url: string): SupportKind {
  const u = url.toLowerCase();
  if (u.includes("t.me") || u.includes("telegram")) return "telegram";
  if (u.includes("discord")) return "discord";
  if (u.includes("vk.com") || u.includes("vkontakte")) return "vk";
  return "generic";
}

/** Subscription lines for Telemt MTProto (`tg://proxy?…`). Splits each entry on newlines (API may bundle several lines). */
export function extractTgProxyLinks(links: string[]): string[] {
  const out: string[] = [];
  for (const raw of links) {
    for (const part of raw.split("\n")) {
      const s = part.trim();
      if (s.toLowerCase().startsWith("tg://proxy")) out.push(s);
    }
  }
  return out;
}

/** Prefer server-provided `mtProtoLinks`; fallback parse from `links` (legacy). */
export function resolveMtProtoLinks(data: Pick<PublicSubPayload, "mtProtoLinks" | "links">): string[] {
  const fromApi = data.mtProtoLinks;
  if (fromApi && fromApi.length > 0) return fromApi;
  return extractTgProxyLinks(data.links ?? []);
}

export function parseLinkTitle(url: string): string {
  const i = url.lastIndexOf("#");
  if (i >= 0 && i < url.length - 1) {
    const raw = url.slice(i + 1).trim();
    try {
      const decoded = decodeURIComponent(raw);
      return decoded || url;
    } catch {
      return raw || url;
    }
  }
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export const MOCK_SUB_DATA: PublicSubPayload = {
  config: {} as SharxSubpageConfig,
  configUuid: "preview",
  subscriptionUrl: "https://example.com/sub/abcdef12345/?preview=1",
  subscriptionJsonUrl: "https://example.com/sub/json/abcdef12345/?preview=1",
  links: [
    "vless://00000000-0000-0000-0000-000000000000@example.com:443?type=tcp&security=reality&pbk=demo&sid=00#Main%20Fast",
    "vless://00000000-0000-0000-0000-000000000000@example.com:443?type=ws&security=tls&path=/demo#Backup",
    "trojan://demo-password@example.com:443?security=tls#Backup%20TLS",
  ],
  user: {
    shortUuid: "preview",
    username: "alice@example.com",
    daysLeft: 17,
    trafficUsed: "12.4 GB",
    trafficLimit: "100 GB",
    expiresAt: new Date(Date.now() + 17 * 86400 * 1000).toISOString(),
    isActive: true,
    userStatus: "ACTIVE",
    isOnline: false,
  },
};
