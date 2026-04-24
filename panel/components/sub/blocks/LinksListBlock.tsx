"use client";

import { Copy, QrCode } from "lucide-react";
import { Button } from "@/components/ui";
import type { BlockLinksList } from "@/lib/sharxSubpageConfig";
import { parseLinkTitle } from "../types";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

export function LinksListBlock({
  block,
  ctx,
}: {
  block: BlockLinksList;
  ctx: BlockRenderContext;
}) {
  const { data, showQrCodes, onCopyLink, onShowQr, t } = ctx;
  const showQr = block.showQr !== false && showQrCodes;
  const title =
    block.title?.trim() ||
    t("pages.publicSub.links", { defaultValue: "Connection links" });

  return (
    <div>
      <h2 className={shell.sectionTitle}>{title}</h2>
      <ul className="flex flex-col gap-3">
        {data.links.map((link, i) => {
          const linkTitle = parseLinkTitle(link);
          return (
            <li key={i} className={shell.linkCard}>
              <div className={shell.linkCardTitle}>
                <span className="truncate">{linkTitle}</span>
              </div>
              <div className={shell.linkActions}>
                {block.showCopy !== false ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-9 !rounded-lg !border-white/10 !bg-white/5 !px-3 !text-xs !text-[#c9d1d9] hover:!bg-white/10"
                    onClick={() => onCopyLink(link)}
                  >
                    <Copy className="size-3.5 text-[#22d3ee]" />
                    {t("copy", { defaultValue: "Copy" })}
                  </Button>
                ) : null}
                {showQr ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-9 !rounded-lg !border-white/10 !bg-white/5 !px-3 !text-xs !text-[#c9d1d9] hover:!bg-white/10"
                    onClick={() => onShowQr(link, linkTitle)}
                  >
                    <QrCode className="size-3.5 text-[#22d3ee]" />
                    {t("pages.publicSub.qr", { defaultValue: "QR" })}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
