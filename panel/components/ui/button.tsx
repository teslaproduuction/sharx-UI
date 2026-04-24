import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";

const variants: Record<ButtonVariant, string> = {
  primary:
    "panel-btn-primary shadow-sm hover:opacity-90 active:scale-[0.98] disabled:opacity-50",
  secondary:
    "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--fg)] hover:bg-[var(--surface-strong)] active:scale-[0.99]",
  ghost:
    "text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] active:scale-[0.99]",
  danger: "text-red-400 hover:bg-red-500/10 active:scale-[0.99]",
  link: "text-[var(--accent)] hover:underline p-0 h-auto",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  children?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className = "", variant = "secondary", type, loading, disabled, children, ...rest },
    ref,
  ) => {
    const v = variants[variant];
    const base =
      "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-[background,color,border-color,opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-standard)] focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:pointer-events-none";
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={`${base} ${v} ${className}`}
        disabled={disabled || loading}
        {...rest}
      >
        {loading ? (
          <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
