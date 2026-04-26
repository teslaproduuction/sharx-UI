/** Favicon URLs for subscription UI (Add to app, installation guide). */
export function appFaviconUrl(domain: string): string {
  const d = domain.replace(/^https?:\/\//, "").split("/")[0] ?? domain;
  return `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(d)}`;
}
