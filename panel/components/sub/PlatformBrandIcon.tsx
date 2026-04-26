import type { SupportedPlatform } from "@/lib/sharxSubpageConfig";

/** v11 keeps stable slugs (e.g. `windows`); v13+ removed some OS marks. */
const SI = (slug: string) =>
  `https://cdn.jsdelivr.net/npm/simple-icons@11.14.0/icons/${slug}.svg`;

/** Brand marks for OS / TV platforms (Simple Icons, inverted for dark UIs). */
const PLATFORM_SVG: Record<SupportedPlatform, string> = {
  ios: SI("apple"),
  android: SI("android"),
  windows: SI("windows"),
  macos: SI("apple"),
  linux: SI("linux"),
  androidtv: SI("android"),
};

type Props = {
  platform: SupportedPlatform;
  className?: string;
};

export function PlatformBrandIcon({ platform, className = "size-3.5" }: Props) {
  const src = PLATFORM_SVG[platform];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={`shrink-0 object-contain opacity-90 [filter:brightness(0)_invert(1)] ${className}`}
    />
  );
}
