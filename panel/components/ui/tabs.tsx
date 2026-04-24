"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tabContentVariants } from "@/lib/motion";

export type TabItem<T extends string = string> = {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  disabled?: boolean;
};

type TabsProps<T extends string = string> = {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  layoutId?: string;
  className?: string;
  size?: "sm" | "md";
  variant?: "pill" | "underline";
};

export function Tabs<T extends string = string>({
  tabs,
  active,
  onChange,
  layoutId = "panel-tab-underline",
  className = "",
  size = "md",
  variant = "pill",
}: TabsProps<T>) {
  const reduce = useReducedMotion();
  const heightCls = size === "sm" ? "h-8 text-[13px]" : "h-10 text-sm";

  return (
    <div
      role="tablist"
      className={`relative inline-flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 ${className}`}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={t.disabled}
            onClick={() => !t.disabled && onChange(t.id)}
            className={`relative inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-3 font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 ${heightCls} ${
              isActive
                ? "text-[var(--fg)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
            }`}
          >
            {isActive ? (
              <motion.span
                layoutId={layoutId}
                className={
                  variant === "pill"
                    ? "absolute inset-0 rounded-lg border border-[var(--border-strong)] bg-[color-mix(in_oklab,var(--accent)_14%,transparent)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "absolute inset-x-2 -bottom-[5px] h-[2px] rounded-full bg-[var(--accent)]"
                }
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 520, damping: 34 }
                }
                aria-hidden
              />
            ) : null}
            <span className="relative z-[1] inline-flex items-center gap-1.5">
              {Icon ? <Icon className="size-[15px] shrink-0 opacity-85" /> : null}
              <span className="truncate">{t.label}</span>
              {t.badge != null ? (
                <span className="ml-0.5 inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-[1px] text-[10px] font-semibold text-[var(--fg-muted)]">
                  {t.badge}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

type TabPanelsProps = {
  value: string;
  children: ReactNode;
  className?: string;
};

/** Animated content switcher. Wrap each panel in <TabPanel id="..."> */
export function TabPanels({ value, children, className = "" }: TabPanelsProps) {
  return (
    <div className={className}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={value}
          variants={tabContentVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
