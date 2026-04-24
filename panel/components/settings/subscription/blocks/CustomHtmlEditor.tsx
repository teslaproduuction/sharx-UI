"use client";

import { useTranslation } from "react-i18next";
import { AlertBanner, Input } from "@/components/ui";
import type { BlockCustomHtml } from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockCustomHtml;
  onChange: (next: BlockCustomHtml) => void;
};

export function CustomHtmlEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <AlertBanner
        type="warning"
        title={t("subBuilder.customHtml.warningTitle", {
          defaultValue: "Custom HTML is sanitized",
        })}
        description={t("subBuilder.customHtml.warningText", {
          defaultValue:
            "Scripts, inline event handlers and javascript: URLs are stripped before rendering.",
        })}
      />
      <label className="block">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.block.titleOverride", { defaultValue: "Title (optional)" })}
        </div>
        <Input
          value={block.title ?? ""}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </label>
      <label className="block">
        <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.customHtml.html", { defaultValue: "HTML" })}
        </div>
        <textarea
          rows={7}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          value={block.html}
          onChange={(e) => onChange({ ...block, html: e.target.value })}
          placeholder={t("subBuilder.customHtml.htmlPlaceholder", {
            defaultValue: "<p>Your custom HTML here…</p>",
          })}
        />
      </label>
    </div>
  );
}
