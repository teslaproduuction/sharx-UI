"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StepState = "pending" | "current" | "done" | "error";

export type StepperItem = {
  id: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  state?: StepState;
};

type StepperProps = {
  steps: StepperItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  className?: string;
  /** allow the user to click any step (default: only done/current) */
  allowJump?: boolean;
};

function stateOf(item: StepperItem, idx: number, activeIdx: number): StepState {
  if (item.state) return item.state;
  if (idx < activeIdx) return "done";
  if (idx === activeIdx) return "current";
  return "pending";
}

const dotClass: Record<StepState, string> = {
  pending:
    "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg-muted)]",
  current:
    "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)] shadow-[0_0_0_4px_color-mix(in_oklab,var(--accent)_12%,transparent)]",
  done: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  error: "border-red-400/70 bg-red-500/15 text-red-300",
};

const labelClass: Record<StepState, string> = {
  pending: "text-[var(--fg-muted)]",
  current: "text-[var(--fg)]",
  done: "text-[var(--fg)]",
  error: "text-red-300",
};

export function Stepper({
  steps,
  activeId,
  onSelect,
  className = "",
  allowJump = false,
}: StepperProps) {
  const reduce = useReducedMotion();
  const activeIdx = Math.max(
    0,
    steps.findIndex((s) => s.id === activeId),
  );

  return (
    <div className={`relative ${className}`}>
      {/* Mobile: compact "Step N / M" summary */}
      <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--fg-muted)] md:hidden">
        <span className="truncate font-medium text-[var(--fg)]">
          {steps[activeIdx]?.label}
        </span>
        <span className="tabular-nums">
          {activeIdx + 1} / {steps.length}
        </span>
      </div>

      <ol className="hidden items-start gap-1 md:flex">
        {steps.map((s, idx) => {
          const st = stateOf(s, idx, activeIdx);
          const Icon = s.icon;
          const clickable =
            onSelect != null &&
            !s.state &&
            (allowJump || st === "done" || st === "current");
          const last = idx === steps.length - 1;
          return (
            <li key={s.id} className="group flex min-w-0 flex-1 items-start">
              <button
                type="button"
                onClick={clickable ? () => onSelect?.(s.id) : undefined}
                disabled={!clickable}
                className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-xl p-1.5 text-left transition-colors ${
                  clickable
                    ? "hover:bg-[var(--surface)]"
                    : "cursor-default"
                }`}
              >
                <span className="relative inline-flex shrink-0 flex-col items-center">
                  <motion.span
                    className={`inline-flex size-8 items-center justify-center rounded-full border text-[13px] font-semibold transition-colors ${dotClass[st]}`}
                    initial={reduce ? false : { scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: "spring",
                      stiffness: 480,
                      damping: 30,
                    }}
                  >
                    {st === "done" ? (
                      <Check className="size-4" strokeWidth={2.4} />
                    ) : Icon ? (
                      <Icon className="size-4" />
                    ) : (
                      idx + 1
                    )}
                  </motion.span>
                </span>
                <div className="min-w-0 pt-1">
                  <div className={`truncate text-sm font-medium ${labelClass[st]}`}>
                    {s.label}
                  </div>
                  {s.description ? (
                    <div className="truncate text-[11px] text-[var(--fg-subtle)]">
                      {s.description}
                    </div>
                  ) : null}
                </div>
              </button>
              {!last ? (
                <div className="mx-1 mt-5 h-px flex-1 bg-[var(--border)]" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
