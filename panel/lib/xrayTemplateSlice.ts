/**
 * Helpers to edit a single top-level key of the Xray template JSON (dns, routing, outbounds, …).
 */

const SECTION_ORDER: string[] = [
  "log",
  "api",
  "stats",
  "policy",
  "dns",
  "inbounds",
  "outbounds",
  "routing",
  "fakedns",
  "transport",
  "reverse",
  "observatory",
  "burstObservatory",
  "metrics",
];

export function getOrderedTemplateKeys(
  root: Record<string, unknown> | null,
  exclude?: Set<string>,
): string[] {
  if (!root) return [];
  const keys = Object.keys(root);
  const ex = exclude ?? new Set<string>();
  const ordered: string[] = [];
  for (const k of SECTION_ORDER) {
    if (keys.includes(k) && !ex.has(k)) ordered.push(k);
  }
  for (const k of keys.sort()) {
    if (!ordered.includes(k) && !ex.has(k)) ordered.push(k);
  }
  return ordered;
}

export function extractSectionJson(root: Record<string, unknown>, key: string): string {
  if (!(key in root)) {
    return "{}";
  }
  return JSON.stringify(root[key], null, 2);
}

export function mergeSectionIntoTemplate(
  templateStr: string,
  key: string,
  sectionJson: string,
): string {
  const root = JSON.parse(templateStr) as Record<string, unknown>;
  const parsed = JSON.parse(sectionJson) as unknown;
  root[key] = parsed;
  return JSON.stringify(root, null, 2);
}

export function isTemplateJsonValid(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}
