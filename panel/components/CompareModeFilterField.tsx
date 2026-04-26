"use client";

import type { TFunction } from "i18next";
import { ChevronDown, ChevronUp, Equal, type LucideIcon, Type } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui";

export type CompareOp = "" | "gt" | "lt" | "eq";

type Mode = "traffic" | "expiry";

const OP_ORDER: CompareOp[] = ["", "gt", "lt", "eq"];

function opIcon(op: CompareOp): LucideIcon {
  if (op === "gt") return ChevronUp;
  if (op === "lt") return ChevronDown;
  if (op === "eq") return Equal;
  return Type;
}

function optionTitle(
  t: TFunction,
  mode: Mode,
  op: CompareOp,
): string {
  if (op === "") {
    return t("pages.clients.filterCompareContains", { defaultValue: "Text" });
  }
  if (op === "gt") {
    return mode === "expiry"
      ? t("pages.clients.filterOpGt", { defaultValue: "after" })
      : t("pages.clients.filterOpGt", { defaultValue: "more than" });
  }
  if (op === "lt") {
    return mode === "expiry"
      ? t("pages.clients.filterOpLt", { defaultValue: "before" })
      : t("pages.clients.filterOpLt", { defaultValue: "less than" });
  }
  return mode === "expiry"
    ? t("pages.clients.filterOpDay", { defaultValue: "on date" })
    : t("pages.clients.filterOpEq", { defaultValue: "equals" });
}

type Props = {
  compareOp: CompareOp;
  onCompareOpChange: (op: CompareOp) => void;
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  className?: string;
  mode: Mode;
};

/**
 * Single-row filter: icon operator + value input. Operator opens a small icon menu.
 */
export function CompareModeFilterField({
  compareOp,
  onCompareOpChange,
  value,
  onValueChange,
  placeholder,
  className = "",
  mode,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const CurrentIcon = opIcon(compareOp);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <div
      ref={rootRef}
      className={`relative flex min-w-0 max-w-[20rem] items-stretch overflow-visible rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] ${className}`}
    >
      <div className="relative shrink-0 self-stretch border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--border)_20%,var(--bg-elevated))]">
        <button
          ref={btnRef}
          type="button"
          className="flex h-8 w-9 min-w-9 items-center justify-center text-[var(--fg-muted)] outline-none transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] hover:text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation();
            }
          }}
          aria-label={t("pages.clients.filterCompareMode", {
            defaultValue: "Match mode",
          })}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          title={optionTitle(t, mode, compareOp)}
        >
          <CurrentIcon className="size-3.5 shrink-0" strokeWidth={2.25} />
        </button>
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 top-full z-50 mt-0.5 w-9 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] py-0.5 shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            {OP_ORDER.map((op) => {
              const Icon = opIcon(op);
              const label = optionTitle(t, mode, op);
              const active = op === compareOp;
              return (
                <li key={op || "c"} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={
                      "flex h-7 w-9 items-center justify-center text-[var(--fg-muted)] outline-none transition-colors " +
                      (active
                        ? "bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] text-[var(--fg)]"
                        : "hover:bg-[color-mix(in_oklab,var(--border)_50%,transparent)] hover:text-[var(--fg)]")
                    }
                    onClick={() => {
                      onCompareOpChange(op);
                      close();
                      btnRef.current?.focus();
                    }}
                    title={label}
                    aria-label={label}
                  >
                    <Icon className="size-3.5 shrink-0" strokeWidth={2.25} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="!h-8 min-w-0 flex-1 !border-0 !bg-transparent !px-2 !py-1 !text-xs"
      />
    </div>
  );
}
