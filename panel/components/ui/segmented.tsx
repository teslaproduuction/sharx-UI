"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type SegmentedItem<T extends string = string> = {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
  hint?: string;
  disabled?: boolean;
};

type SegmentedProps<T extends string = string> = {
  items: SegmentedItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
  layoutId?: string;
  fullWidth?: boolean;
};

export function Segmented<T extends string = string>({
  items,
  value,
  onChange,
  size = "md",
  className = "",
  layoutId = "segmented-active",
  fullWidth = false,
}: SegmentedProps<T>) {
  const reduce = useReducedMotion();
  const h = size === "sm" ? "h-8 text-[12px]" : "h-10 text-sm";
  return (
    <div
      role="radiogroup"
      className={`relative inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 ${
        fullWidth ? "w-full" : ""
      } ${className}`}
    >
      {items.map((it) => {
        const selected = it.id === value;
        const Icon = it.icon;
        return (
          <button
            key={it.id}
            role="radio"
            aria-checked={selected}
            type="button"
            disabled={it.disabled}
            onClick={() => !it.disabled && onChange(it.id)}
            title={it.hint}
            className={`relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-3 font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 ${h} ${
              fullWidth ? "flex-1" : ""
            } ${selected ? "text-[var(--fg)]" : "text-[var(--fg-muted)] hover:text-[var(--fg)]"}`}
          >
            {selected ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-lg border border-[var(--border-strong)] bg-[color-mix(in_oklab,var(--accent)_16%,transparent)]"
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 34 }
                }
                aria-hidden
              />
            ) : null}
            <span className="relative z-[1] inline-flex items-center gap-1.5">
              {Icon ? <Icon className="size-[15px] shrink-0" /> : null}
              <span className="truncate">{it.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
