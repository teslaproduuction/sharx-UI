import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import type { AppSettings, SubpageBlock } from "@/lib/sharxSubpageConfig";
import { genBlockId } from "@/lib/sharxSubpageConfig";
import type { PublicSubPayload } from "../types";
import { SubscriptionInfoBlock } from "./SubscriptionInfoBlock";
import { InstallationGuideBlock } from "./InstallationGuideBlock";
import { LinksListBlock } from "./LinksListBlock";
import { SupportCtaBlock } from "./SupportCtaBlock";
import { CustomHtmlBlock } from "./CustomHtmlBlock";
import { MetricsBlock } from "./MetricsBlock";
import { AddToAppBlock } from "./AddToAppBlock";

export type BlockRenderContext = {
  data: PublicSubPayload;
  showQrCodes: boolean;
  onCopyLink: (url: string) => void;
  onShowQr: (url: string, title: string) => void;
  interactive: boolean;
  t: TFunction;
  appSettings?: AppSettings;
};

export function renderBlock(block: SubpageBlock, ctx: BlockRenderContext): ReactNode {
  switch (block.kind) {
    case "subscription-info":
      return <SubscriptionInfoBlock block={block} ctx={ctx} />;
    case "installation-guide":
      return <InstallationGuideBlock block={block} ctx={ctx} />;
    case "links-list":
      // Deprecated visual block: keep config for header actions,
      // but never render per-link cards on the public page.
      return null;
    case "support-cta":
      return <SupportCtaBlock block={block} ctx={ctx} />;
    case "custom-html":
      return <CustomHtmlBlock block={block} ctx={ctx} />;
    case "metrics":
      return <MetricsBlock block={block} ctx={ctx} />;
    case "add-to-app":
      return <AddToAppBlock block={block} ctx={ctx} />;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Default block set used when rendering a legacy (v1) config, so the public
 * page keeps its familiar layout.
 */
export function defaultBlocksForLegacy(): SubpageBlock[] {
  return [
    {
      id: genBlockId(),
      kind: "metrics",
      enabled: true,
      show: { username: true, status: true, expires: true, traffic: true },
    },
    {
      id: genBlockId(),
      kind: "links-list",
      enabled: true,
      showQr: true,
      showCopy: true,
    },
  ];
}
