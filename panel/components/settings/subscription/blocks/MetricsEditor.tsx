"use client";

import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui";
import type { BlockMetrics } from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockMetrics;
  onChange: (next: BlockMetrics) => void;
};

type Key = keyof BlockMetrics["show"];

export function MetricsEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  const rows: { key: Key; label: string }[] = [
    {
      key: "username",
      label: t("pages.publicSub.username", { defaultValue: "Username" }),
    },
    {
      key: "status",
      label: t("pages.publicSub.status", { defaultValue: "Status" }),
    },
    {
      key: "expires",
      label: t("pages.publicSub.expires", { defaultValue: "Expires" }),
    },
    {
      key: "traffic",
      label: t("pages.publicSub.traffic", { defaultValue: "Traffic" }),
    },
  ];
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => (
        <label
          key={r.key}
          className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]"
        >
          <span className="min-w-0 truncate">{r.label}</span>
          <Switch
            checked={block.show[r.key]}
            onChange={(next) =>
              onChange({ ...block, show: { ...block.show, [r.key]: next } })
            }
          />
        </label>
      ))}
    </div>
  );
}
