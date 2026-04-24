"use client";

import { motion, useReducedMotion } from "framer-motion";

type SwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
};

export function Switch({
  checked,
  onChange,
  size = "md",
  disabled,
  ariaLabel,
  className = "",
}: SwitchProps) {
  const reduce = useReducedMotion();
  const trackW = size === "sm" ? "w-8" : "w-10";
  const trackH = size === "sm" ? "h-[18px]" : "h-[22px]";
  const dotSz = size === "sm" ? "size-[14px]" : "size-[18px]";
  const x = size === "sm" ? 14 : 18;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 ${trackW} ${trackH} ${
        checked
          ? "border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_32%,transparent)]"
          : "border-[var(--border)] bg-[var(--bg-elevated)]"
      } ${className}`}
    >
      <motion.span
        className={`absolute left-[2px] top-1/2 -translate-y-1/2 rounded-full bg-[var(--fg)] shadow ${dotSz} ${
          checked ? "bg-[var(--fg)]" : "bg-[var(--fg-muted)]"
        }`}
        animate={{ x: checked ? x : 0 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 32 }}
        aria-hidden
      />
    </button>
  );
}
