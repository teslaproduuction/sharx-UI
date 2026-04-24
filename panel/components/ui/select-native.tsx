import { forwardRef, type SelectHTMLAttributes } from "react";

export const SelectNative = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: "md" | "lg" }
>(({ className = "", inputSize = "md", children, ...rest }, ref) => {
  const h = inputSize === "lg" ? "h-11 px-3 text-base" : "h-10 px-3 text-sm";
  return (
    <select
      ref={ref}
      className={`w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] ${h} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
SelectNative.displayName = "SelectNative";
