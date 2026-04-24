"use client";

import type { CSSProperties, ReactNode } from "react";
import type { SharxBranding } from "@/lib/sharxSubpageConfig";
import shell from "./subscription-shell.module.css";

type Props = {
  children: ReactNode;
  className?: string;
  /** Optional branding color overrides — injected as CSS vars on the root. */
  branding?: SharxBranding;
  /** "system" | "dark" | "light" — forwarded as data-theme on root. */
  theme?: string;
};

function buildCssVars(branding?: SharxBranding): CSSProperties {
  if (!branding) return {};
  const style: Record<string, string> = {};
  const assign = (key: string, value?: string) => {
    if (value && value.trim()) style[key] = value.trim();
  };
  assign("--sub-accent", branding.accentColor);
  assign("--sub-accent-ambient", branding.accentAmbientColor);
  assign("--sub-bg", branding.bgColor);
  assign("--sub-bg-elevated", branding.bgElevatedColor);
  assign("--sub-fg", branding.fgColor);
  assign("--sub-fg-muted", branding.fgMutedColor);
  assign("--sub-border", branding.borderColor);
  assign("--sub-success", branding.successColor);
  assign("--sub-danger", branding.dangerColor);
  return style as CSSProperties;
}

function resolveTheme(theme?: string): "dark" | "light" | undefined {
  if (theme === "light") return "light";
  if (theme === "dark") return "dark";
  return undefined;
}

export function SubPageShell({
  children,
  className = "",
  branding,
  theme,
}: Props) {
  const style = buildCssVars(branding);
  const dataTheme = resolveTheme(theme);
  return (
    <div
      className={`${shell.root} ${className}`}
      style={style}
      data-theme={dataTheme}
    >
      <div className={shell.animatedBg} aria-hidden />
      <div className={shell.content}>{children}</div>
    </div>
  );
}

export { shell as subShellStyles };
