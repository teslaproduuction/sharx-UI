"use client";

import { useTranslation } from "react-i18next";
import { Input, Switch } from "@/components/ui";
import type { BlockLinksList } from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockLinksList;
  onChange: (next: BlockLinksList) => void;
};

export function LinksListEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.block.titleOverride", { defaultValue: "Title (optional)" })}
        </label>
        <Input
          value={block.title ?? ""}
          placeholder={t("pages.publicSub.links", {
            defaultValue: "Connection links",
          })}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </div>
      <ToggleRow
        label={t("subBuilder.links.showCopy", { defaultValue: "Show copy button" })}
        checked={block.showCopy}
        onChange={(showCopy) => onChange({ ...block, showCopy })}
      />
      <ToggleRow
        label={t("subBuilder.links.showQr", { defaultValue: "Show QR button" })}
        checked={block.showQr}
        onChange={(showQr) => onChange({ ...block, showQr })}
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
      <span className="min-w-0 truncate">{label}</span>
      <Switch checked={checked} onChange={onChange} />
    </label>
  );
}
