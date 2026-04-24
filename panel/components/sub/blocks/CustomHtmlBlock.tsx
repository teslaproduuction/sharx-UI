"use client";

import type { BlockCustomHtml } from "@/lib/sharxSubpageConfig";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

/**
 * Very small allow-list sanitizer: strips <script>, inline event handlers,
 * javascript: URLs. Not a replacement for a battle-tested sanitizer but it
 * defends against the most common XSS vectors and keeps the config safe for
 * trusted admins editing their own page.
 */
function sanitize(html: string): string {
  if (typeof html !== "string") return "";
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/javascript\s*:/gi, "about:blank#blocked-");
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, "");
  out = out.replace(/<object\b[^>]*>[\s\S]*?<\/object\s*>/gi, "");
  out = out.replace(/<embed\b[^>]*>/gi, "");
  return out;
}

export function CustomHtmlBlock({
  block,
}: {
  block: BlockCustomHtml;
  ctx: BlockRenderContext;
}) {
  if (!block.html?.trim()) return null;
  const clean = sanitize(block.html);
  return (
    <div>
      {block.title?.trim() ? (
        <h2 className={shell.sectionTitle}>{block.title}</h2>
      ) : null}
      <div
        className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-[13px] leading-relaxed text-[#c9d1d9] prose-invert"
        dangerouslySetInnerHTML={{ __html: clean }}
      />
    </div>
  );
}
