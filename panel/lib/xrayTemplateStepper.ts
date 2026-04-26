import {
  Braces,
  Cog,
  MoreHorizontal,
  Network,
  SlidersHorizontal,
  Unplug,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import {
  type XrayNavGroupId,
  partitionSectionKeys,
} from "@/lib/xrayTemplateNavConfig";
import type { StepperItem } from "@/components/ui";

export type XrayTemplateStepperId = "general" | XrayNavGroupId | "other" | "full";

const GROUP_ICONS: Record<XrayNavGroupId, LucideIcon> = {
  core: Cog,
  network: Network,
  endpoints: Unplug,
  advanced: Wand2,
  other: MoreHorizontal,
};

function stepDescriptionKey(id: string): string {
  return `pages.xray.stepDesc.${id}`;
}

/**
 * Map current template nav to a high-level step (for the horizontal stepper).
 */
export function getActiveStepId(
  navId: string,
  grouped: { group: { id: string }; keys: string[] }[],
  otherKeys: string[],
): XrayTemplateStepperId {
  if (navId === "general" || navId === "full") return navId;
  for (const { group, keys } of grouped) {
    if (keys.includes(String(navId))) {
      return group.id as XrayTemplateStepperId;
    }
  }
  if (otherKeys.includes(String(navId))) {
    return "other";
  }
  return "general";
}

/**
 * First concrete nav id to show for a step (so group steps open a real section in the left nav).
 */
export function getNavIdForStep(
  stepId: string,
  grouped: { group: { id: string }; keys: string[] }[],
  otherKeys: string[],
): string {
  if (stepId === "general") return "general";
  if (stepId === "full") return "full";
  if (stepId === "other") {
    return otherKeys[0] ?? "full";
  }
  const g = grouped.find((x) => x.group.id === stepId);
  if (g?.keys[0]) return g.keys[0];
  return "general";
}

type TFn = (key: string, o?: { defaultValue?: string }) => string;

/**
 * Build Stepper items: General, one step per group that has keys, Other (if any), Entire template.
 */
export function buildXrayTemplateStepperItems(
  t: TFn,
  sectionKeys: string[],
): { steps: StepperItem[]; grouped: ReturnType<typeof partitionSectionKeys>["grouped"]; otherKeys: string[] } {
  const { grouped, otherKeys } = partitionSectionKeys(sectionKeys);
  const steps: StepperItem[] = [
    {
      id: "general",
      label: t("pages.xray.navGeneral", { defaultValue: "General" }),
      description: t(stepDescriptionKey("general"), {
        defaultValue: "Quick options and log paths without editing full JSON",
      }),
      icon: SlidersHorizontal,
    },
  ];

  for (const { group, keys } of grouped) {
    if (keys.length === 0) continue;
    const gid = group.id as XrayNavGroupId;
    steps.push({
      id: group.id,
      label: t(group.titleKey),
      description: t(stepDescriptionKey(group.id), { defaultValue: t(group.titleKey) }),
      icon: GROUP_ICONS[gid] ?? Cog,
    });
  }

  if (otherKeys.length > 0) {
    steps.push({
      id: "other",
      label: t("pages.xray.navGroup.misc", { defaultValue: "Other" }),
      description: t(stepDescriptionKey("additionalTopLevel"), {
        defaultValue: "Additional top-level keys in this template",
      }),
      icon: MoreHorizontal,
    });
  }

  steps.push({
    id: "full",
    label: t("pages.xray.navFullTemplate", { defaultValue: "Entire template (JSON)" }),
    description: t(stepDescriptionKey("full"), { defaultValue: "Edit the full Xray JSON" }),
    icon: Braces,
  });

  return { steps, grouped, otherKeys };
}
