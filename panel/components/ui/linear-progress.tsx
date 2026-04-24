type LinearProgressProps = {
  percent: number;
  strokeColor: string;
  className?: string;
};

export function LinearProgress({ percent, strokeColor, className = "" }: LinearProgressProps) {
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`h-2 w-full overflow-hidden rounded-full bg-[var(--surface)] ${className}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${p}%`, background: strokeColor }}
      />
    </div>
  );
}
