/**
 * Parse/serialize Xray `dns` object for the template GUI.
 * `dns: null` means disabled / default resolver behavior in template.
 */

export type DnsFormState = {
  enabled: boolean;
  /** Xray servers array */
  servers: unknown[];
  /** Raw hosts object */
  hosts: Record<string, unknown>;
  clientIp: string;
  queryStrategy: string;
  disableCache: boolean;
  disableFallback: boolean;
  tag: string;
};

const DEFAULT: DnsFormState = {
  enabled: false,
  servers: [
    { address: "1.1.1.1", port: 53, domains: ["geosite:geolocation-!cn"], expectIPs: ["geoip:!cn"] },
    { address: "1.1.1.1", port: 53, domains: ["geosite:cn"], expectIPs: ["geoip:cn"] },
  ],
  hosts: { "host.docker.internal": "127.0.0.1" },
  clientIp: "",
  queryStrategy: "UseIP",
  disableCache: false,
  disableFallback: false,
  tag: "dns_inbound",
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

export function defaultDnsForm(): DnsFormState {
  return {
    ...DEFAULT,
    servers: JSON.parse(JSON.stringify(DEFAULT.servers)) as unknown[],
    hosts: { ...DEFAULT.hosts },
  };
}

/**
 * @param sectionJson — value of the `dns` key (can be "null" or object JSON)
 */
export function parseDnsSection(sectionJson: string): { state: DnsFormState; error: string | null } {
  const t = sectionJson.trim();
  if (t === "" || t === "null" || t === "undefined") {
    return { state: { ...defaultDnsForm(), enabled: false }, error: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(sectionJson) as unknown;
  } catch {
    return { state: defaultDnsForm(), error: "invalid" };
  }
  if (parsed === null) {
    return { state: { ...defaultDnsForm(), enabled: false }, error: null };
  }
  const o = asRecord(parsed);
  if (!o) {
    return { state: defaultDnsForm(), error: "not-object" };
  }
  return {
    state: {
      enabled: true,
      servers: Array.isArray(o.servers) ? o.servers : DEFAULT.servers,
      hosts: asRecord(o.hosts) ?? {},
      clientIp: typeof o.clientIp === "string" ? o.clientIp : "",
      queryStrategy: typeof o.queryStrategy === "string" ? o.queryStrategy : "UseIP",
      disableCache: Boolean(o.disableCache),
      disableFallback: Boolean(o.disableFallback),
      tag: typeof o.tag === "string" ? o.tag : "dns_inbound",
    },
    error: null,
  };
}

export function serializeDnsSection(state: DnsFormState): string {
  if (!state.enabled) {
    return "null";
  }
  const out: Record<string, unknown> = {
    servers: state.servers,
    hosts: state.hosts,
    queryStrategy: state.queryStrategy,
    disableCache: state.disableCache,
    disableFallback: state.disableFallback,
  };
  if (state.clientIp.trim()) out.clientIp = state.clientIp.trim();
  if (state.tag.trim()) out.tag = state.tag.trim();
  return JSON.stringify(out, null, 2);
}
