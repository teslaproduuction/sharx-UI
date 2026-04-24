"use client";

import { LifeBuoy } from "lucide-react";
import type { BlockSupportCta } from "@/lib/sharxSubpageConfig";
import type { BlockRenderContext } from "./index";

export function SupportCtaBlock({
  block,
  ctx,
}: {
  block: BlockSupportCta;
  ctx: BlockRenderContext;
}) {
  if (!block.title && !block.text && !block.url) return null;
  const isInteractive = ctx.interactive && !!block.url;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-gradient-to-br from-[rgba(34,211,238,0.08)] to-[rgba(151,117,250,0.06)] p-5 sm:flex-row sm:items-center">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(34,211,238,0.32)] bg-[rgba(34,211,238,0.14)] text-[#22d3ee]">
        <LifeBuoy className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-white">{block.title}</div>
        {block.text ? (
          <div className="mt-1 text-[13px] leading-relaxed text-[#8b949e]">
            {block.text}
          </div>
        ) : null}
      </div>
      {block.url && block.buttonLabel ? (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center rounded-xl border border-[rgba(34,211,238,0.3)] bg-[rgba(34,211,238,0.12)] px-4 py-2 text-sm font-medium text-[#c9d1d9] transition hover:bg-[rgba(34,211,238,0.22)]"
          onClick={(e) => {
            if (!isInteractive) e.preventDefault();
          }}
        >
          {block.buttonLabel}
        </a>
      ) : null}
    </div>
  );
}
