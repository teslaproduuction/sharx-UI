"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  buildRemarkModel,
  parseOrderLetters,
  REMARK_ORDER_LETTERS,
  type RemarkOrderLetter,
} from "@/lib/remarkModelUi";
import { IconButton, SelectNative } from "@/components/ui";

type Props = {
  sep: string;
  order: string;
  onCommit: (remarkModel: string) => void;
};

export function RemarkModelOrderBuilder({ sep, order, onCommit }: Props) {
  const { t } = useTranslation();
  const letters = parseOrderLetters(order);
  const sepChar = Array.from(sep || "-")[0] ?? "-";
  const [addKey, setAddKey] = useState(0);

  const commit = (next: RemarkOrderLetter[]) => {
    onCommit(buildRemarkModel(sep, next.join("")));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= letters.length) return;
    const next = letters.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    commit(next);
  };

  const removeAt = (idx: number) => {
    commit(letters.filter((_, i) => i !== idx));
  };

  const append = (letter: RemarkOrderLetter) => {
    commit([...letters, letter]);
    setAddKey((k) => k + 1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {letters.length === 0 ? (
        <p className="text-xs text-[var(--fg-subtle)]">
          {t("pages.settings.remarkModelOrderEmpty", {
            defaultValue: "No segments yet — add one from the list below.",
          })}
        </p>
      ) : (
        <ul className="flex flex-col gap-0">
          {letters.map((letter, idx) => (
            <li key={idx} className="flex min-w-0 flex-col">
              {idx > 0 ? (
                <div
                  className="flex items-center gap-2 py-1.5 text-[11px] font-medium text-[var(--fg-subtle)]"
                  aria-hidden
                >
                  <span className="h-px min-w-[1.25rem] flex-1 bg-[var(--border)]" />
                  <span className="shrink-0 font-mono tabular-nums">{sepChar}</span>
                  <span className="h-px min-w-[1.25rem] flex-1 bg-[var(--border)]" />
                </div>
              ) : null}
              <div className="flex min-w-0 flex-wrap items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-2 pl-3 pr-2 shadow-sm sm:flex-nowrap sm:items-center sm:pr-1.5">
                <span className="shrink-0 rounded-md bg-[var(--accent)]/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-[var(--accent)]">
                  {letter}
                </span>
                <span className="min-w-0 flex-[1_1_12rem] text-xs text-[var(--fg-muted)] sm:flex-1">
                  {t(`pages.settings.remarkModelField.${letter}`)}
                </span>
                <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-0.5 sm:w-auto">
                  <IconButton
                    type="button"
                    label={t("moveUp")}
                    disabled={idx === 0}
                    className="!h-8 !w-8"
                    onClick={() => move(idx, idx - 1)}
                  >
                    <ChevronUp className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    type="button"
                    label={t("moveDown")}
                    disabled={idx === letters.length - 1}
                    className="!h-8 !w-8"
                    onClick={() => move(idx, idx + 1)}
                  >
                    <ChevronDown className="size-4" aria-hidden />
                  </IconButton>
                  <IconButton
                    type="button"
                    label={t("delete")}
                    className="!h-8 !w-8 text-[var(--fg-subtle)] hover:text-red-400"
                    onClick={() => removeAt(idx)}
                  >
                    <X className="size-4" aria-hidden />
                  </IconButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex max-w-md flex-col gap-1.5 sm:flex-row sm:items-end sm:gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs font-medium text-[var(--fg-subtle)]">
            {t("pages.settings.remarkModelAddField", { defaultValue: "Add segment" })}
          </span>
          <SelectNative
            key={addKey}
            value=""
            className="font-mono text-xs sm:text-sm"
            onChange={(e) => {
              const v = e.target.value;
              if ((REMARK_ORDER_LETTERS as readonly string[]).includes(v)) {
                append(v as RemarkOrderLetter);
              }
            }}
          >
            <option value="">
              {t("pages.settings.remarkModelAddPlaceholder", {
                defaultValue: "Choose field…",
              })}
            </option>
            {REMARK_ORDER_LETTERS.map((letter) => (
              <option key={letter} value={letter}>
                {letter} — {t(`pages.settings.remarkModelField.${letter}`)}
              </option>
            ))}
          </SelectNative>
        </div>
      </div>
    </div>
  );
}
