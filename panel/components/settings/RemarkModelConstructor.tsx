"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildRemarkModel,
  formatRemarkModelPreview,
  parseRemarkModelUi,
} from "@/lib/remarkModelUi";
import { Input } from "@/components/ui";
import { RemarkModelOrderBuilder } from "@/components/settings/RemarkModelOrderBuilder";

type Props = {
  value: string;
  onChange: (remarkModel: string) => void;
};

export function RemarkModelConstructor({ value, onChange }: Props) {
  const { t } = useTranslation();
  const ui = useMemo(() => parseRemarkModelUi(value), [value]);
  const preview = useMemo(
    () => formatRemarkModelPreview(value?.trim() ? value : "-ieo"),
    [value],
  );

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:gap-5 lg:flex-row lg:items-start">
        <div className="shrink-0 space-y-1.5 lg:min-w-[5.5rem]">
          <label
            className="block text-xs font-medium text-[var(--fg-subtle)]"
            htmlFor="remark-model-sep"
          >
            {t("pages.settings.remarkModelSep")}
          </label>
          <Input
            id="remark-model-sep"
            className="h-10 w-full max-w-[5rem] text-center font-mono text-base tabular-nums"
            maxLength={1}
            autoComplete="off"
            spellCheck={false}
            value={Array.from(ui.sep || "-")[0] ?? "-"}
            onChange={(e) => {
              const first = Array.from(e.target.value || "-")[0] ?? "-";
              onChange(buildRemarkModel(first, ui.order));
            }}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-xs font-medium text-[var(--fg-subtle)]">
            {t("pages.settings.remarkModelOrder")}
          </div>
          <RemarkModelOrderBuilder
            sep={ui.sep}
            order={ui.order}
            onCommit={onChange}
          />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
        {t("pages.settings.remarkModelOrderHint")}
      </p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs text-[var(--fg-muted)]">
        <span className="font-semibold text-[var(--fg)]">
          {t("pages.settings.remarkModelLegendFieldLabel")}
        </span>{" "}
        i = {t("pages.settings.remarkModelField.i")}, e ={" "}
        {t("pages.settings.remarkModelField.e")}, o ={" "}
        {t("pages.settings.remarkModelField.o")}, n ={" "}
        {t("pages.settings.remarkModelField.n")}, p ={" "}
        {t("pages.settings.remarkModelField.p")}, r ={" "}
        {t("pages.settings.remarkModelField.r")}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2.5">
        <span className="text-xs font-medium text-[var(--fg-muted)]">
          {t("pages.settings.sampleRemark")}:
        </span>
        <code className="break-all text-sm font-mono text-[var(--fg)]">{preview}</code>
      </div>
    </div>
  );
}
