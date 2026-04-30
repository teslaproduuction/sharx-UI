"use client";

import { Copy, KeyRound, QrCode } from "lucide-react";
import type { BlockLinksList } from "@/lib/sharxSubpageConfig";
import { parseLinkTitle } from "../types";
import type { BlockRenderContext } from "./index";

export function LinksListBlock({
  block,
  ctx,
}: {
  block: BlockLinksList;
  ctx: BlockRenderContext;
}) {
  const { data, showQrCodes, onCopyLink, onShowQr, interactive, t } = ctx;
  const showQr = block.showQr !== false && showQrCodes;
  const title =
    block.title?.trim() ||
    t("pages.publicSub.connectionKeys", { defaultValue: "Connection keys" });

  if (!data.links || data.links.length === 0) return null;

  return (
    <div className="rounded-xl border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--sub-fg-strong,#fff)]">{title}</h2>
        {data.links.length > 1 ? (
          <span className="rounded-full border border-[color-mix(in_oklab,var(--sub-accent)_35%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] px-2 py-[1px] text-[11px] font-semibold text-[var(--sub-accent,#22d3ee)]">
            {data.links.length}
          </span>
        ) : null}
      </div>

      <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
        {data.links.map((link, i) => {
          const linkTitle = parseLinkTitle(link);
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg border border-[var(--sub-border-soft,rgba(255,255,255,0.05))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] px-3 py-2"
            >
              <KeyRound className="size-4 shrink-0 text-[var(--sub-accent,#22d3ee)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--sub-fg-strong,#fff)]">
                {linkTitle}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {block.showCopy !== false ? (
                  <button
                    type="button"
                    onClick={() => { if (interactive) onCopyLink(link); }}
                    className="grid size-7 place-items-center rounded-md text-[var(--sub-fg-muted,#8b949e)] transition hover:bg-[var(--sub-surface-strong,rgba(255,255,255,0.08))] hover:text-[var(--sub-accent,#22d3ee)]"
                  >
                    <Copy className="size-3.5" />
                  </button>
                ) : null}
                {showQr ? (
                  <button
                    type="button"
                    onClick={() => { if (interactive) onShowQr(link, linkTitle); }}
                    className="grid size-7 place-items-center rounded-md text-[var(--sub-fg-muted,#8b949e)] transition hover:bg-[var(--sub-surface-strong,rgba(255,255,255,0.08))] hover:text-[var(--sub-accent,#22d3ee)]"
                  >
                    <QrCode className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
