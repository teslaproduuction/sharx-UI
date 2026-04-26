import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  /** default: comfortable padding */
  padding?: "none" | "sm" | "md" | "lg";
};

const pad: Record<NonNullable<SurfaceProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6 sm:p-8",
};

/** Card-like surface; see globals `.panel-surface`. */
export function Surface({ children, className = "", padding = "md" }: SurfaceProps) {
  return (
    <div className={`panel-surface ${pad[padding]} ${className}`}>
      {children}
    </div>
  );
}
