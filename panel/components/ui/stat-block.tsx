import type { ReactNode } from "react";

type StatBlockProps = {
  title: string;
  value: ReactNode;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

export function StatBlock({ title, value, prefix, suffix }: StatBlockProps) {
  return (
    <div>
      <div className="text-xs text-[var(--fg-subtle)]">{title}</div>
      <div className="mt-0.5 flex items-baseline gap-1 text-lg font-semibold tabular-nums text-[var(--fg)]">
        {prefix}
        <span>{value}</span>
        {suffix}
      </div>
    </div>
  );
}
