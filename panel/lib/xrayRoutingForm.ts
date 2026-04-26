/**
 * Simplified Xray `routing` editor: domainStrategy + field rules; balancers / complex rules → advanced JSON.
 */

export type FieldRuleFormRow = {
  id: string;
  outboundTag: string;
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

export type RoutingFormState = {
  domainStrategy: string;
  rules: FieldRuleFormRow[];
};

const SIMPLE_RULE_KEYS = new Set([
  "type",
  "outboundTag",
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

export function routingNeedsAdvancedJson(routing: unknown): boolean {
  const o = asRecord(routing);
  if (!o) return true;
  for (const k of Object.keys(o)) {
    if (!TOP_ROUTING_ALLOW.has(k) && o[k] != null) return true;
  }
  if (o.domainMatcher != null) return true;
  if (o.rule != null) return true;
  const balancers = o.balancers;
  if (Array.isArray(balancers) && balancers.length > 0) return true;
  const rules = o.rules;
  if (!Array.isArray(rules)) return true;
  for (const r of rules) {
    const m = asRecord(r);
    if (!m) return true;
    if (m.balancerTag != null) return true;
    if (m.attrs != null) return true;
    const t = m.type;
    if (t != null && t !== "field") return true;
    for (const k of Object.keys(m)) {
      if (!SIMPLE_RULE_KEYS.has(k)) return true;
    }
    for (const k of Object.keys(m)) {
      if (k === "type" || k === "outboundTag") continue;
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
  const hasAny =
    otag ||
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
  if (otag) r.outboundTag = otag;
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

export function defaultRoutingForm(): RoutingFormState {
  return {
    domainStrategy: "AsIs",
    rules: [
      {
        id: randomId(),
        outboundTag: "direct",
        domainLines: "",
        ipLines: "geoip:private",
        port: "",
        network: "",
        protocolLines: "",
        inboundTag: "",
        source: "",
        user: "",
      },
    ],
  };
}

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
  if (rules.length === 0) {
    return {
      state: { domainStrategy: ds, rules: defaultRoutingForm().rules },
      needsAdvanced: false,
      error: null,
    };
  }
  return { state: { domainStrategy: ds, rules }, needsAdvanced: false, error: null };
}

export function serializeRoutingSection(state: RoutingFormState): string {
  const rules = state.rules.map((row) => formRowToRule(row)).filter((x): x is Record<string, unknown> => x != null);
  return JSON.stringify({ domainStrategy: state.domainStrategy, rules }, null, 2);
}

export function analyzeRoutingSection(sectionJson: string): "visual" | "advanced" {
  const { needsAdvanced } = parseRoutingSection(sectionJson);
  return needsAdvanced ? "advanced" : "visual";
}
