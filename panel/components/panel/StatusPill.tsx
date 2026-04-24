type StatusPillProps = {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
};

export function StatusPill({ active, activeLabel, inactiveLabel }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        active
          ? "border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[var(--accent)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)]"
      }`}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}
