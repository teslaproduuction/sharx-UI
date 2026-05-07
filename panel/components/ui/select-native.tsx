import { forwardRef, type SelectHTMLAttributes } from "react";

/** Chevron for native selects (`appearance-none` removes the system arrow). */
const SELECT_CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

export const SelectNative = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: "sm" | "md" | "lg" }
>(({ className = "", inputSize = "md", style, children, ...rest }, ref) => {
  const h =
    inputSize === "lg"
      ? "h-11 px-3 text-base"
      : inputSize === "sm"
        ? "h-8 px-2.5 text-xs"
        : "h-10 px-3 text-sm";
  const chevronPad = inputSize === "sm" ? "pr-8" : inputSize === "lg" ? "pr-10" : "pr-9";
  const bgPos =
    inputSize === "sm"
      ? "bg-[position:right_0.45rem_center] bg-[length:1rem_1rem]"
      : "bg-[position:right_0.65rem_center] bg-[length:1.125rem_1.125rem]";
  return (
    <select
      ref={ref}
      style={{
        backgroundImage: SELECT_CHEVRON,
        ...style,
      }}
      className={`w-full min-w-0 cursor-pointer appearance-none rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60 ${bgPos} bg-no-repeat ${chevronPad} ${h} ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
});
SelectNative.displayName = "SelectNative";
