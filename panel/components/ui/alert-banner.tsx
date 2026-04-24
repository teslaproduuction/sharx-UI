import type { ReactNode } from "react";

type AlertBannerProps = {
  type?: "error" | "warning" | "info";
  title: ReactNode;
  description?: ReactNode;
  onClose?: () => void;
  className?: string;
};

const styles: Record<NonNullable<AlertBannerProps["type"]>, string> = {
  error: "border-red-500/30 bg-red-500/10 text-red-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
  info: "border-[var(--border)] bg-[var(--surface)] text-[var(--fg)]",
};

export function AlertBanner({
  type = "error",
  title,
  description,
  onClose,
  className = "",
}: AlertBannerProps) {
  return (
    <div
      className={`rounded-xl border p-4 ${styles[type]} ${className}`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{title}</div>
          {description != null && <div className="mt-1 text-sm opacity-90">{description}</div>}
        </div>
        {onClose != null && (
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1 text-sm opacity-80 hover:opacity-100"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
