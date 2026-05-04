import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";

type PageHeaderProps = {
  title: string;
  /** Optional upper label (eyebrow), SharX-style */
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  /** Use gradient on title — best for short titles */
  accentTitle?: boolean;
  /** Optional section icon (e.g. match sidebar nav) */
  icon?: LucideIcon;
  /** Defaults to `accent` when `icon` is set */
  iconTone?: IconTileTone;
};

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  accentTitle,
  icon: HeaderIcon,
  iconTone = "accent",
}: PageHeaderProps) {
  const iconSize = "lg";

  const titleRow = (
    <div className="flex min-w-0 flex-row items-start gap-4">
      {HeaderIcon ? (
        <IconTile icon={HeaderIcon} tone={iconTone} size={iconSize} className="shrink-0" />
      ) : null}
      <div className="min-w-0">
        {eyebrow ? (
          <span className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--fg-muted)]">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
            />
            {eyebrow}
          </span>
        ) : null}
        <h1
          className={`font-heading text-balance text-2xl font-semibold tracking-tight sm:text-3xl ${
            accentTitle ? "text-accent-gradient" : "text-[var(--fg)]"
          }`}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--fg-muted)]">{description}</p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {titleRow}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center justify-end gap-x-2 gap-y-2 sm:max-w-[min(100%,56rem)] sm:shrink-0">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
