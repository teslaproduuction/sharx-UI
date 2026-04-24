import { forwardRef, type InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  inputSize?: "md" | "lg";
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", inputSize = "md", ...rest }, ref) => {
    const h = inputSize === "lg" ? "h-11 px-4 text-base" : "h-10 px-3 text-sm";
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] ${h} ${className}`}
        {...rest}
      />
    );
  },
);
Input.displayName = "Input";
