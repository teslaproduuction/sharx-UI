/**
 * Read/patch a small subset of Xray template JSON for a beginner-friendly UI.
 */

export type XraySimpleCore = {
  loglevel: string;
  /** Xray "access" log: "none" or a file path */
  access: string;
  /** error log path; "" or "none" are valid */
  error: string;
  dnsLog: boolean;
  maskAddress: string;
  domainStrategy: string;
};

const DEFAULT_LOG = {
  access: "none",
  dnsLog: false,
  error: "",
  loglevel: "warning",
  maskAddress: "",
} as const;

const LOG_LEVELS = ["debug", "info", "warning", "error", "none"] as const;

const DOMAIN_STRATEGIES = ["AsIs", "IPIfNonMatch", "IPOnDemand"] as const;

export function isKnownLogLevel(v: string): boolean {
  return (LOG_LEVELS as readonly string[]).includes(v);
}

export function isKnownDomainStrategy(v: string): boolean {
  return (DOMAIN_STRATEGIES as readonly string[]).includes(v);
}

export function extractSimpleCore(templateStr: string): XraySimpleCore {
  let root: Record<string, unknown>;
  try {
    root = JSON.parse(templateStr) as Record<string, unknown>;
  } catch {
    return {
      ...DEFAULT_LOG,
      domainStrategy: "AsIs",
    };
  }

  let log = DEFAULT_LOG as unknown as Record<string, unknown>;
  const rawLog = root.log;
  if (rawLog && typeof rawLog === "object" && !Array.isArray(rawLog)) {
    log = { ...DEFAULT_LOG, ...(rawLog as Record<string, unknown>) };
  }

  const loglevel =
    typeof log.loglevel === "string" && log.loglevel ? String(log.loglevel) : DEFAULT_LOG.loglevel;
  const access =
    typeof log.access === "string" ? log.access : String(log.access ?? DEFAULT_LOG.access);
  const error = typeof log.error === "string" ? log.error : String(log.error ?? DEFAULT_LOG.error);
  const dnsLog = Boolean(log.dnsLog);
  const maskAddress =
    typeof log.maskAddress === "string"
      ? log.maskAddress
      : String(log.maskAddress ?? DEFAULT_LOG.maskAddress);

  let domainStrategy = "AsIs";
  const rawR = root.routing;
  if (rawR && typeof rawR === "object" && !Array.isArray(rawR)) {
    const ds = (rawR as Record<string, unknown>).domainStrategy;
    if (typeof ds === "string" && ds) domainStrategy = ds;
  }

  return {
    loglevel,
    access,
    error,
    dnsLog,
    maskAddress,
    domainStrategy,
  };
}

function asLogObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

function asRoutingObject(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

export function patchSimpleCore(templateStr: string, next: Partial<XraySimpleCore>): string {
  const root = JSON.parse(templateStr) as Record<string, unknown>;
  const log = asLogObject(root.log);
  if (next.loglevel !== undefined) log.loglevel = next.loglevel;
  if (next.access !== undefined) log.access = next.access;
  if (next.error !== undefined) log.error = next.error;
  if (next.dnsLog !== undefined) log.dnsLog = next.dnsLog;
  if (next.maskAddress !== undefined) log.maskAddress = next.maskAddress;
  root.log = log;

  if (next.domainStrategy !== undefined) {
    const routing = asRoutingObject(root.routing);
    routing.domainStrategy = next.domainStrategy;
    root.routing = routing;
  }

  return JSON.stringify(root, null, 2);
}
