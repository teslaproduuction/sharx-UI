import { Loader2 } from "lucide-react";

type SpinnerProps = { className?: string; size?: number };

export function Spinner({ className = "", size = 32 }: SpinnerProps) {
  return (
    <Loader2
      size={size}
      className={`animate-spin text-[var(--accent)] ${className}`}
      aria-label="Loading"
    />
  );
}
