import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// When a parent directory has another package-lock.json, Next may infer the wrong workspace root.
const panelDir = path.dirname(fileURLToPath(import.meta.url));

const raw = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();
/** Must match `webBasePath` from SharX (Go). Empty = site root. No trailing slash (Next rules). */
const nextBasePath =
  raw && raw !== "/"
    ? (raw.startsWith("/") ? raw : `/${raw}`).replace(/\/$/, "")
    : undefined;

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  outputFileTracingRoot: panelDir,
  ...(nextBasePath ? { basePath: nextBasePath } : {}),
  // `experimental.viewTransition` was disabled: the browser snapshot included the
  // whole panel (header + menu + content), so the shell looked like it reloaded
  // on every client navigation. In-panel fade uses `.route-fade` in PanelShell instead.
};

export default nextConfig;
