import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
};

/**
 * Icon-only control — `label` is used for the native `title` tooltip (SharX-style: no extra lib).
 */
export function IconButton({ children, className = "", label, type = "button", ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
