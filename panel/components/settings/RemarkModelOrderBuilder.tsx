"use client";

import { X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  buildRemarkModel,
  parseOrderLetters,
  REMARK_ORDER_LETTERS,
  type RemarkOrderLetter,
} from "@/lib/remarkModelUi";
import { IconButton } from "@/components/ui";

type Props = {
  sep: string;
  order: string;
  onCommit: (remarkModel: string) => void;
};

export function RemarkModelOrderBuilder({ sep, order, onCommit }: Props) {
  const { t } = useTranslation();
  const letters = parseOrderLetters(order);
  const sepChar = Array.from(sep || "-")[0] ?? "-";
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const commit = (next: RemarkOrderLetter[]) => {
    onCommit(buildRemarkModel(sep, next.join("")));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= letters.length || from === to) return;
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
  };

  const onDragStart = (idx: number) => {
    setDragIndex(idx);
  };

  const onDragEnd = () => {
    setDragIndex(null);
  };

  const onDropTo = (idx: number) => (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (dragIndex == null || dragIndex === idx) return;
    move(dragIndex, idx);
    setDragIndex(idx);
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
        <ul className="flex flex-wrap items-center gap-1.5">
          {letters.map((letter, idx) => (
            <li key={idx} className="flex items-center gap-1.5">
              {idx > 0 ? (
                <span
                  className="shrink-0 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-subtle)]"
                  title={t("pages.settings.remarkModelSep", { defaultValue: "Separator" })}
                  aria-label={t("pages.settings.remarkModelSep", { defaultValue: "Separator" })}
                >
                  {sepChar}
                </span>
              ) : null}
              <button
                type="button"
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragEnd={onDragEnd}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropTo(idx)}
                className={`rounded-md border px-2 py-1 font-mono text-xs font-semibold transition ${
                  dragIndex === idx
                    ? "border-[var(--accent)]/60 bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] hover:border-[var(--accent)]/40"
                }`}
                title={t("pages.settings.remarkModelDragHint", {
                  defaultValue: "Drag to reorder",
                })}
              >
                {letter}
              </button>
              <IconButton
                type="button"
                label={t("delete")}
                className="!h-6 !w-6 text-[var(--fg-subtle)] hover:text-red-400"
                onClick={() => removeAt(idx)}
              >
                <X className="size-3" aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {REMARK_ORDER_LETTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => append(letter)}
              className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-xs text-[var(--fg)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              +{letter}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
