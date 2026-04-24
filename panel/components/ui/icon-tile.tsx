import type { LucideIcon } from "lucide-react";

export type IconTileTone = "accent" | "info" | "success" | "warning" | "danger" | "neutral";

type IconTileProps = {
  icon: LucideIcon;
  tone: IconTileTone;
  size?: "sm" | "md" | "lg";
  className?: string;
  "aria-hidden"?: boolean;
};

const sizeClass: Record<NonNullable<IconTileProps["size"]>, string> = {
  sm: "size-8 [&_svg]:size-3.5",
  md: "size-11 [&_svg]:size-5",
  lg: "size-14 [&_svg]:size-7",
};

export function IconTile({
  icon: Icon,
  tone,
  size = "md",
  className = "",
  "aria-hidden": ariaHidden = true,
}: IconTileProps) {
  return (
    <span
      className={`icon-tile icon-tile--${tone} inline-flex shrink-0 items-center justify-center rounded-xl ${sizeClass[size]} ${className}`}
      aria-hidden={ariaHidden}
    >
      <Icon strokeWidth={1.65} />
    </span>
  );
}
