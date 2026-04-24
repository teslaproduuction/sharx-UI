import {
  BookOpen,
  Code2,
  LifeBuoy,
  LinkIcon,
  ListChecks,
  Smartphone,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type {
  SubpageBlock,
  SubpageBlockKind,
} from "@/lib/sharxSubpageConfig";
import {
  defaultAppButtons,
  defaultInstallationGroups,
  genBlockId,
} from "@/lib/sharxSubpageConfig";
import type { IconTileTone } from "@/components/ui";
import { AddToAppEditor } from "./AddToAppEditor";
import { CustomHtmlEditor } from "./CustomHtmlEditor";
import { InstallationGuideEditor } from "./InstallationGuideEditor";
import { LinksListEditor } from "./LinksListEditor";
import { MetricsEditor } from "./MetricsEditor";
import { SubscriptionInfoEditor } from "./SubscriptionInfoEditor";
import { SupportCtaEditor } from "./SupportCtaEditor";

export type BlockDescriptor = {
  kind: SubpageBlockKind;
  /** i18n key for label, e.g. subBuilder.blocks.kinds.subscriptionInfo.label */
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  tone: IconTileTone;
  create: () => SubpageBlock;
};

export const BLOCK_DESCRIPTORS: BlockDescriptor[] = [
  {
    kind: "subscription-info",
    labelKey: "subBuilder.blocks.kinds.subscriptionInfo.label",
    descriptionKey: "subBuilder.blocks.kinds.subscriptionInfo.summary",
    icon: UserRound,
    tone: "info",
    create: () => ({
      id: genBlockId(),
      kind: "subscription-info",
      enabled: true,
      variant: "expanded",
    }),
  },
  {
    kind: "metrics",
    labelKey: "subBuilder.blocks.kinds.metrics.label",
    descriptionKey: "subBuilder.blocks.kinds.metrics.summary",
    icon: ListChecks,
    tone: "accent",
    create: () => ({
      id: genBlockId(),
      kind: "metrics",
      enabled: true,
      show: { username: true, status: true, expires: true, traffic: true },
    }),
  },
  {
    kind: "installation-guide",
    labelKey: "subBuilder.blocks.kinds.installationGuide.label",
    descriptionKey: "subBuilder.blocks.kinds.installationGuide.summary",
    icon: BookOpen,
    tone: "success",
    create: () => ({
      id: genBlockId(),
      kind: "installation-guide",
      enabled: true,
      style: "stepper",
      groups: defaultInstallationGroups(),
      platforms: ["ios", "android", "windows", "macos", "linux"],
      showDeeplinks: true,
    }),
  },
  {
    kind: "links-list",
    labelKey: "subBuilder.blocks.kinds.linksList.label",
    descriptionKey: "subBuilder.blocks.kinds.linksList.summary",
    icon: LinkIcon,
    tone: "accent",
    create: () => ({
      id: genBlockId(),
      kind: "links-list",
      enabled: true,
      showQr: true,
      showCopy: true,
    }),
  },
  {
    kind: "add-to-app",
    labelKey: "subBuilder.blocks.kinds.addToApp.label",
    descriptionKey: "subBuilder.blocks.kinds.addToApp.summary",
    icon: Smartphone,
    tone: "info",
    create: () => ({
      id: genBlockId(),
      kind: "add-to-app",
      enabled: true,
      preferJsonUrl: false,
      buttons: defaultAppButtons(),
    }),
  },
  {
    kind: "support-cta",
    labelKey: "subBuilder.blocks.kinds.supportCta.label",
    descriptionKey: "subBuilder.blocks.kinds.supportCta.summary",
    icon: LifeBuoy,
    tone: "warning",
    create: () => ({
      id: genBlockId(),
      kind: "support-cta",
      enabled: true,
      title: "Need help?",
      text: "Our team is happy to help if you run into issues.",
      buttonLabel: "Contact support",
      url: "",
    }),
  },
  {
    kind: "custom-html",
    labelKey: "subBuilder.blocks.kinds.customHtml.label",
    descriptionKey: "subBuilder.blocks.kinds.customHtml.summary",
    icon: Code2,
    tone: "neutral",
    create: () => ({
      id: genBlockId(),
      kind: "custom-html",
      enabled: true,
      html: "",
    }),
  },
];

export function describeBlock(block: SubpageBlock): BlockDescriptor {
  return (
    BLOCK_DESCRIPTORS.find((d) => d.kind === block.kind) ??
    BLOCK_DESCRIPTORS[BLOCK_DESCRIPTORS.length - 1]
  );
}

type EditorProps = {
  block: SubpageBlock;
  onChange: (next: SubpageBlock) => void;
};

export function BlockEditor({ block, onChange }: EditorProps) {
  switch (block.kind) {
    case "subscription-info":
      return <SubscriptionInfoEditor block={block} onChange={onChange} />;
    case "installation-guide":
      return <InstallationGuideEditor block={block} onChange={onChange} />;
    case "links-list":
      return <LinksListEditor block={block} onChange={onChange} />;
    case "support-cta":
      return <SupportCtaEditor block={block} onChange={onChange} />;
    case "custom-html":
      return <CustomHtmlEditor block={block} onChange={onChange} />;
    case "metrics":
      return <MetricsEditor block={block} onChange={onChange} />;
    case "add-to-app":
      return <AddToAppEditor block={block} onChange={onChange} />;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}
