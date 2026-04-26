const DEFAULT_NODE_PORT = "8080";

function stripTrailingUrlSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

function normalizeNodeAddress(raw: string, opts: { useTls: boolean }) {
  const t = raw.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (low.startsWith("http://") || low.startsWith("https://")) {
    return stripTrailingUrlSlashes(t);
  }
  // Bare host:port — default http; https only when TLS for API is enabled in the form.
  const scheme = opts.useTls ? "https" : "http";
  return stripTrailingUrlSlashes(`${scheme}://${t}`);
}

function formatUrlHostForEdit(u: URL): string {
  const p = u.protocol;
  const h = u.hostname;
  if (h.includes(":")) {
    return `${p}//[${h}]`;
  }
  return `${p}//${h}`;
}

/** Splits a stored node `address` into host (or full URL without explicit port) and port. */
export function parseNodeAddressToHostPort(address: string): {
  host: string;
  port: string;
} {
  const t = address.trim();
  if (!t) return { host: "", port: DEFAULT_NODE_PORT };
  const low = t.toLowerCase();
  if (low.startsWith("http://") || low.startsWith("https://")) {
    try {
      const u = new URL(t);
      const portStr = u.port || DEFAULT_NODE_PORT;
      return { host: formatUrlHostForEdit(u), port: portStr };
    } catch {
      return { host: t, port: DEFAULT_NODE_PORT };
    }
  }
  if (t.startsWith("[")) {
    const end = t.indexOf("]:");
    if (end > 0) {
      return {
        host: t.slice(0, end + 1),
        port: t.slice(end + 2) || DEFAULT_NODE_PORT,
      };
    }
    return { host: t, port: DEFAULT_NODE_PORT };
  }
  const lastColon = t.lastIndexOf(":");
  if (lastColon > 0) {
    const portPart = t.slice(lastColon + 1);
    if (/^\d+$/.test(portPart)) {
      const n = +portPart;
      if (n >= 1 && n <= 65535) {
        return { host: t.slice(0, lastColon), port: portPart };
      }
    }
  }
  return { host: t, port: DEFAULT_NODE_PORT };
}

function joinBareHostAndPort(bare: string, port: string): string {
  if (!bare) return "";
  if (bare.startsWith("[")) {
    return `${bare}:${port}`;
  }
  return `${bare}:${port}`;
}

export function isValidNodePortString(port: string): boolean {
  const s = (port || "").trim() || DEFAULT_NODE_PORT;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 1 && n <= 65535;
}

/**
 * Builds a single `address` string (panel API) from host + port fields.
 * `host` may be a full `http://` / `https://` URL (port field overrides port in URL if any).
 */
export function buildAddressFromHostPort(
  host: string,
  port: string,
  opts: { useTls: boolean },
): string {
  const p = (port || "").trim() || DEFAULT_NODE_PORT;
  if (!isValidNodePortString(p)) return "";
  const h = host.trim();
  if (!h) return "";
  const low = h.toLowerCase();
  if (low.startsWith("http://") || low.startsWith("https://")) {
    try {
      const u = new URL(h);
      u.port = p;
      return stripTrailingUrlSlashes(u.toString().replace(/\/$/, ""));
    } catch {
      return "";
    }
  }
  return normalizeNodeAddress(joinBareHostAndPort(h, p), opts);
}

/**
 * In host network mode, public URL in docs often omits the published port
 * (API on :8080; reverse proxy or DNS without :port in URL).
 */
export function addressForHostComposeHint(
  addressInput: string,
  opts: { useTls: boolean },
): string {
  const normalized = normalizeNodeAddress(addressInput.trim(), opts);
  if (!normalized) return "";
  try {
    const u = new URL(
      normalized.startsWith("http") ? normalized : `http://${normalized}`,
    );
    u.port = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return normalized;
  }
}

export { DEFAULT_NODE_PORT };
