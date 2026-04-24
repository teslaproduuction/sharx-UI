/**
 * server-side basePath from env (e.g. "" or /prefix); must match SharX `webBasePath` when building the panel.
 */
export function getBasePath(): string {
  const b = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  if (!b) return "";
  return b.startsWith("/") ? b.replace(/\/$/, "") : `/${b.replace(/\/$/, "")}`;
}

/** Absolute web path, e.g. p("login") -> /login or /prefix/login */
export function p(path: string): string {
  const base = getBasePath();
  const s = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${s}` : s;
}

/** After webBasePath, e.g. `panel/...` or `ws`. */
export function panel(path: string): string {
  const rest = path.startsWith("/") ? path.slice(1) : path;
  return p(`panel/${rest}`);
}
