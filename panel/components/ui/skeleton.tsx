type SkeletonProps = {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
};

const roundedCls: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
  full: "rounded-full",
};

export function Skeleton({ className = "", rounded = "md" }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`inline-block bg-[var(--surface)] ${roundedCls[rounded]} panel-skeleton ${className}`}
    />
  );
}
