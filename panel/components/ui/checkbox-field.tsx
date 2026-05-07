import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

/** Shared classes for panel-styled native checkboxes (used by `Checkbox` and `CheckboxField`). */
export const checkboxControlClass =
  "size-4 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-[var(--bg-elevated)] accent-[var(--accent)] shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  className?: string;
};

/** Bare checkbox for tables and custom layouts (same look as `CheckboxField`). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className = "", ...rest },
  ref,
) {
  return (
    <input ref={ref} type="checkbox" className={`${checkboxControlClass} ${className}`.trim()} {...rest} />
  );
});

type CheckboxFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "className"
> & {
  label: ReactNode;
  className?: string;
};

export function CheckboxField({ label, className = "", id, ...rest }: CheckboxFieldProps) {
  const cid = id ?? `cb-${String(label).slice(0, 8)}`;
  return (
    <label
      htmlFor={cid}
      className={`inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--fg-muted)] ${className}`}
    >
      <Checkbox {...rest} id={cid} />
      {label}
    </label>
  );
}
