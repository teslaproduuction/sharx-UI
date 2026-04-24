import type { InputHTMLAttributes, ReactNode } from "react";

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
      <input
        id={cid}
        type="checkbox"
        className="size-4 rounded border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--accent)] focus:ring-[var(--accent)]"
        {...rest}
      />
      {label}
    </label>
  );
}
