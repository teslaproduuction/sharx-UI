/**
 * Xray template editor: nav groups and which top-level JSON keys belong to each group.
 */

export type XrayNavGroupId = "core" | "network" | "endpoints" | "advanced" | "other";

export type XrayNavGroupDef = {
  id: XrayNavGroupId;
  /** i18n key under pages.xray.navGroup.* */
  titleKey: string;
  keys: readonly string[];
};

export const XRAY_TEMPLATE_NAV_GROUPS: readonly XrayNavGroupDef[] = [
  { id: "core", titleKey: "pages.xray.navGroup.core", keys: ["log", "api", "stats", "policy"] },
  { id: "network", titleKey: "pages.xray.navGroup.network", keys: ["dns", "routing", "fakedns"] },
  { id: "endpoints", titleKey: "pages.xray.navGroup.endpoints", keys: ["inbounds", "outbounds"] },
  {
    id: "advanced",
    titleKey: "pages.xray.navGroup.advanced",
    keys: ["transport", "reverse", "observatory", "burstObservatory", "metrics"],
  },
];

export function partitionSectionKeys(sectionKeys: string[]): {
  grouped: { group: XrayNavGroupDef; keys: string[] }[];
  otherKeys: string[];
} {
  const used = new Set<string>();
  const grouped = XRAY_TEMPLATE_NAV_GROUPS.map((group) => {
    const keys = sectionKeys.filter((k) => group.keys.includes(k));
    for (const k of keys) used.add(k);
    return { group, keys };
  });
  const otherKeys = sectionKeys.filter((k) => !used.has(k));
  return { grouped, otherKeys };
}
