/**
 * Simplified Xray `routing` editor: domainStrategy + field rules; balancers / complex rules → advanced JSON.
 */

export type FieldRuleFormRow = {
  id: string;
  outboundTag: string;
  /** Xray load-balancer tag. Mutually exclusive with outboundTag; when set the rule
   *  dispatches to a balancer (see {@link BalancerFormRow}) instead of a single outbound. */
  balancerTag: string;
  /** one entry per line: domain lines (geosite:, domain:, full:, etc.) */
  domainLines: string;
  /** one CIDR/entry per line (geoip:, ip:, etc.) */
  ipLines: string;
  port: string;
  network: string;
  /** e.g. bittorrent */
  protocolLines: string;
  /** comma or newline separated inbound tags */
  inboundTag: string;
  source: string;
  user: string;
};

/** Xray `routing.balancers[]` — picks a live outbound from `selector` by `strategy`.
 *  This is the primitive cascade fallback / observatory health-routing rides on. */
export type BalancerFormRow = {
  id: string;
  tag: string;
  /** outbound tag prefixes the balancer load-balances across (one per line). */
  selectorLines: string;
  /** random | roundRobin | leastPing | leastLoad */
  strategyType: string;
};

export type RoutingFormState = {
  domainStrategy: string;
  rules: FieldRuleFormRow[];
  balancers: BalancerFormRow[];
};

export const BALANCER_STRATEGIES = ["random", "roundRobin", "leastPing", "leastLoad"] as const;

const SIMPLE_RULE_KEYS = new Set([
  "type",
  "outboundTag",
  "balancerTag",
  "domain",
  "ip",
  "port",
  "network",
  "protocol",
  "inboundTag",
  "source",
  "user",
  "attr",
  "attrs",
  "domainMatcher",
  "sourcePort",
  "package",
]);

function randomId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const a = new Uint8Array(6);
    globalThis.crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function linesFromArray(a: unknown): string {
  if (!Array.isArray(a)) return "";
  return a.map((x) => String(x)).join("\n");
}

function stringArrayToLines(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function toInboundTagList(s: string): string[] | string {
  const parts = s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts[0]!;
  return parts;
}

/**
 * If routing has balancers or non-simple field rules, GUI cannot represent it.
 */
const TOP_ROUTING_ALLOW = new Set([
  "domainStrategy",
  "domainMatcher",
  "rules",
  "balancers",
  "rule",
]);

const SIMPLE_BALANCER_KEYS = new Set(["tag", "selector", "strategy", "fallbackTag"]);

function balancerNeedsAdvanced(b: unknown): boolean {
  const m = asRecord(b);
  if (!m) return true;
  for (const k of Object.keys(m)) {
    if (!SIMPLE_BALANCER_KEYS.has(k) && m[k] != null) return true;
  }
  if (typeof m.tag !== "string") return true;
  if (m.selector != null && !Array.isArray(m.selector)) return true;
  const st = m.strategy;
  if (st != null) {
    const sm = asRecord(st);
    if (!sm) return true;
    for (const k of Object.keys(sm)) {
      if (k !== "type" && k !== "settings" && sm[k] != null) return true;
    }
    // settings on a strategy (e.g. leastLoad params) → keep, but only simple primitives
    if (sm.settings != null && asRecord(sm.settings) == null) return true;
  }
  return false;
}

export function routingNeedsAdvancedJson(routing: unknown): boolean {
  const o = asRecord(routing);
  if (!o) return true;
  for (const k of Object.keys(o)) {
    if (!TOP_ROUTING_ALLOW.has(k) && o[k] != null) return true;
  }
  if (o.domainMatcher != null) return true;
  if (o.rule != null) return true;
  const balancers = o.balancers;
  if (balancers != null) {
    if (!Array.isArray(balancers)) return true;
    for (const b of balancers) {
      if (balancerNeedsAdvanced(b)) return true;
    }
  }
  const rules = o.rules;
  if (!Array.isArray(rules)) return true;
  for (const r of rules) {
    const m = asRecord(r);
    if (!m) return true;
    if (m.attrs != null) return true;
    const t = m.type;
    if (t != null && t !== "field") return true;
    for (const k of Object.keys(m)) {
      if (!SIMPLE_RULE_KEYS.has(k)) return true;
    }
    for (const k of Object.keys(m)) {
      if (k === "type" || k === "outboundTag" || k === "balancerTag") continue;
      const v = m[k];
      if (v != null) {
        if (Array.isArray(v)) {
          for (const x of v) {
            if (Array.isArray(x) || (typeof x === "object" && x != null)) return true;
          }
        } else if (typeof v === "object") {
          return true;
        }
      }
    }
  }
  return false;
}

function ruleToFormRow(m: Record<string, unknown>, id: string): FieldRuleFormRow {
  return {
    id,
    outboundTag: typeof m.outboundTag === "string" ? m.outboundTag : "",
    balancerTag: typeof m.balancerTag === "string" ? m.balancerTag : "",
    domainLines: linesFromArray(m.domain),
    ipLines: linesFromArray(m.ip),
    port: m.port != null ? String(m.port) : "",
    network: m.network != null ? String(m.network) : "",
    protocolLines: linesFromArray(m.protocol),
    inboundTag: (() => {
      const it = m.inboundTag;
      if (it == null) return "";
      if (Array.isArray(it)) return it.map(String).join(", ");
      return String(it);
    })(),
    source: linesFromArray(m.source),
    user: m.user != null ? String(m.user) : "",
  };
}

function formRowToRule(row: FieldRuleFormRow): Record<string, unknown> | null {
  const otag = row.outboundTag.trim();
  const btag = row.balancerTag.trim();
  const hasAny =
    otag ||
    btag ||
    row.domainLines.trim() ||
    row.ipLines.trim() ||
    row.port.trim() ||
    row.network.trim() ||
    row.protocolLines.trim() ||
    row.inboundTag.trim() ||
    row.source.trim() ||
    row.user.trim();
  if (!hasAny) return null;
  const r: Record<string, unknown> = { type: "field" };
  // balancerTag wins when both set — Xray ignores outboundTag if balancerTag present.
  if (btag) r.balancerTag = btag;
  else if (otag) r.outboundTag = otag;
  const d = stringArrayToLines(row.domainLines);
  if (d.length) r.domain = d;
  const ips = stringArrayToLines(row.ipLines);
  if (ips.length) r.ip = ips;
  if (row.port.trim()) {
    const n = Number(row.port);
    r.port = Number.isFinite(n) ? n : row.port;
  }
  if (row.network.trim()) r.network = row.network.trim();
  const prot = stringArrayToLines(row.protocolLines);
  if (prot.length) r.protocol = prot;
  if (row.inboundTag.trim()) {
    r.inboundTag = toInboundTagList(row.inboundTag);
  }
  const src = stringArrayToLines(row.source);
  if (src.length) r.source = src;
  if (row.user.trim()) r.user = row.user.trim();
  return r;
}

export const DEFAULT_DOMAIN_STRATEGIES = ["AsIs", "IPIfNonMatch", "IPOnDemand"] as const;

export function emptyRuleRow(outboundTag = ""): FieldRuleFormRow {
  return {
    id: randomId(),
    outboundTag,
    balancerTag: "",
    domainLines: "",
    ipLines: "",
    port: "",
    network: "",
    protocolLines: "",
    inboundTag: "",
    source: "",
    user: "",
  };
}

export function emptyBalancerRow(): BalancerFormRow {
  return { id: randomId(), tag: "", selectorLines: "", strategyType: "leastPing" };
}

export function defaultRoutingForm(): RoutingFormState {
  return {
    domainStrategy: "IPIfNonMatch",
    rules: [
      {
        ...emptyRuleRow("direct"),
        ipLines: "geoip:private",
      },
    ],
    balancers: [],
  };
}

/**
 * One-click rule presets, 3X-UI style. Each builds a ready field-rule row.
 * Kept data-only so the UI can render localized labels by key.
 */
export type RoutingPreset = {
  key: string;
  /** default English label — UI overrides via i18n `pages.xray.routingBuilder.presets.<key>` */
  label: string;
  hint: string;
  build: () => FieldRuleFormRow;
};

export const ROUTING_PRESETS: RoutingPreset[] = [
  {
    key: "blockAds",
    label: "Block ads",
    hint: "geosite:category-ads-all → block",
    build: () => ({ ...emptyRuleRow("block"), domainLines: "geosite:category-ads-all" }),
  },
  {
    key: "blockTorrent",
    label: "Block BitTorrent",
    hint: "protocol bittorrent → block",
    build: () => ({ ...emptyRuleRow("block"), protocolLines: "bittorrent" }),
  },
  {
    key: "directPrivate",
    label: "Direct LAN / private",
    hint: "geoip:private → direct",
    build: () => ({ ...emptyRuleRow("direct"), ipLines: "geoip:private" }),
  },
  {
    key: "directCN",
    label: "Direct China",
    hint: "geosite:cn + geoip:cn → direct",
    build: () => ({ ...emptyRuleRow("direct"), domainLines: "geosite:cn", ipLines: "geoip:cn" }),
  },
  {
    key: "directIR",
    label: "Direct Iran",
    hint: "geosite:category-ir + geoip:ir → direct",
    build: () => ({ ...emptyRuleRow("direct"), domainLines: "geosite:category-ir", ipLines: "geoip:ir" }),
  },
  {
    key: "directRU",
    label: "Direct Russia",
    hint: "geosite:category-ru + geoip:ru → direct",
    build: () => ({ ...emptyRuleRow("direct"), domainLines: "geosite:category-ru", ipLines: "geoip:ru" }),
  },
  {
    key: "blockPorn",
    label: "Block adult",
    hint: "geosite:category-porn → block",
    build: () => ({ ...emptyRuleRow("block"), domainLines: "geosite:category-porn" }),
  },
  {
    key: "blockPrivateDns",
    label: "Block private DNS leak",
    hint: "port 853 (DoT) → block",
    build: () => ({ ...emptyRuleRow("block"), port: "853" }),
  },
];

/**
 * @param sectionJson `routing` key JSON
 */
export function parseRoutingSection(sectionJson: string): {
  state: RoutingFormState | null;
  needsAdvanced: boolean;
  error: string | null;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sectionJson) as unknown;
  } catch {
    return { state: null, needsAdvanced: true, error: "invalid" };
  }
  const o = asRecord(parsed);
  if (!o) {
    return { state: null, needsAdvanced: true, error: "not-object" };
  }
  if (routingNeedsAdvancedJson(o)) {
    return { state: null, needsAdvanced: true, error: null };
  }
  const ds = typeof o.domainStrategy === "string" ? o.domainStrategy : "AsIs";
  const rulesRaw = o.rules;
  const rules: FieldRuleFormRow[] = [];
  if (Array.isArray(rulesRaw)) {
    for (const r of rulesRaw) {
      const m = asRecord(r);
      if (m) rules.push(ruleToFormRow(m, randomId()));
    }
  }
  const balancers: BalancerFormRow[] = [];
  if (Array.isArray(o.balancers)) {
    for (const b of o.balancers) {
      const m = asRecord(b);
      if (!m) continue;
      const st = asRecord(m.strategy);
      balancers.push({
        id: randomId(),
        tag: typeof m.tag === "string" ? m.tag : "",
        selectorLines: linesFromArray(m.selector),
        strategyType: st && typeof st.type === "string" ? st.type : "random",
      });
    }
  }
  if (rules.length === 0 && balancers.length === 0) {
    return {
      state: { domainStrategy: ds, rules: defaultRoutingForm().rules, balancers: [] },
      needsAdvanced: false,
      error: null,
    };
  }
  return { state: { domainStrategy: ds, rules, balancers }, needsAdvanced: false, error: null };
}

function balancerRowToObject(b: BalancerFormRow): Record<string, unknown> | null {
  const tag = b.tag.trim();
  if (!tag) return null;
  const selector = stringArrayToLines(b.selectorLines);
  const out: Record<string, unknown> = { tag };
  if (selector.length) out.selector = selector;
  if (b.strategyType.trim()) out.strategy = { type: b.strategyType.trim() };
  return out;
}

export function serializeRoutingSection(state: RoutingFormState): string {
  const rules = state.rules.map((row) => formRowToRule(row)).filter((x): x is Record<string, unknown> => x != null);
  const balancers = (state.balancers ?? [])
    .map(balancerRowToObject)
    .filter((x): x is Record<string, unknown> => x != null);
  const out: Record<string, unknown> = { domainStrategy: state.domainStrategy, rules };
  if (balancers.length) out.balancers = balancers;
  return JSON.stringify(out, null, 2);
}

export function analyzeRoutingSection(sectionJson: string): "visual" | "advanced" {
  const { needsAdvanced } = parseRoutingSection(sectionJson);
  return needsAdvanced ? "advanced" : "visual";
}
