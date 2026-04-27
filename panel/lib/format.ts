const ONE_GB = 1073741824;

export function sizeFormat(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(i === 0 ? 0 : 2)} ${u[i]}`;
}

export function speedMbpsFormat(bitsPerSecond: number): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) return "0 Mbps";
  const mbps = bitsPerSecond / (1024 * 1024);
  const digits = mbps >= 100 ? 0 : mbps >= 10 ? 1 : 2;
  return `${mbps.toFixed(digits)} Mbps`;
}

export function toFixed(n: number, d: number) {
  return Number(n).toFixed(d);
}

export function formatSecond(s: number): string {
  if (!s || s < 0) return "0s";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

/**
 * Go/GORM often serializes `createdAt` / `updatedAt` as Unix seconds; other fields may be ms.
 * Values under 1e12 are treated as seconds and converted to ms for `Date`.
 */
export function panelTimestampToMs(t: number | undefined | null): number | undefined {
  if (t == null || t === 0) return undefined;
  if (!Number.isFinite(t)) return undefined;
  if (t > 0 && t < 1_000_000_000_000) return Math.round(t * 1000);
  return t;
}

export { ONE_GB };
