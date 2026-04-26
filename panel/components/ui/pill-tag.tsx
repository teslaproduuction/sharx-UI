import type { ReactNode } from "react";

type PillTone = "green" | "blue" | "neutral" | "amber" | "rose";

const tones: Record<PillTone, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  blue: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  neutral: "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)]",
  amber: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  rose: "border-rose-500/35 bg-rose-500/10 text-rose-100",
};

export function PillTag({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
