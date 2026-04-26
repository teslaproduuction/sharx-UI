/**
 * server-side basePath from env (e.g. "" or /prefix); must match SharX `webBasePath` when building the panel.
 */
export function getBasePath(): string {
  const b = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
  if (!b) return "";
  return b.startsWith("/") ? b.replace(/\/$/, "") : `/${b.replace(/\/$/, "")}`;
}

/**
 * Path for `next/link` `href` only. Next prepends `next.config.js` `basePath` for you — do **not**
 * pass `p()` (which includes the web base) or client-side routing can break and the browser will
 * do a full `Document` load (menu reloads) on every click, especially with `output: "export"`.
 * Use `p()` / `panel()` for API URLs, `window.location`, and raw `<a href>`.
 *
 * Must match `next.config` `trailingSlash: true`: without a final `/`, Next (or the server) may
 * issue a redirect — the browser then loads a new `Document` and the whole panel flashes like F5.
 */
export function linkP(path: string): string {
  let s = path.startsWith("/") ? path : `/${path}`;
  if (s.length > 1 && !s.endsWith("/")) {
    s += "/";
  }
  return s;
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
