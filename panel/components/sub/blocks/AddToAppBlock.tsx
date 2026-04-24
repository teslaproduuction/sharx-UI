"use client";

import { Smartphone } from "lucide-react";
import {
  APP_CATALOG,
  normalizeAddToAppBlock,
  type AppButton,
  type BlockAddToApp,
} from "@/lib/sharxSubpageConfig";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

type RenderedButton = {
  id: string;
  label: string;
  href: string;
  iconUrl?: string;
  platforms?: string[];
  badge?: string;
};

function base64Url(input: string): string {
  if (typeof btoa === "function") {
    return btoa(unescape(encodeURIComponent(input)));
  }
  return Buffer.from(input, "utf-8").toString("base64");
}

type SubstitutionVars = {
  url: string;
  urlEncoded: string;
  b64Url: string;
  urlJson: string;
  urlJsonEncoded: string;
  happEncrypted: string;
  v2raytunEncrypted: string;
};

function substitute(template: string, vars: SubstitutionVars): string {
  return template
    .replace(/\{url\}/g, vars.url)
    .replace(/\{urlEncoded\}/g, vars.urlEncoded)
    .replace(/\{b64Url\}/g, vars.b64Url)
    .replace(/\{urlJson\}/g, vars.urlJson)
    .replace(/\{urlJsonEncoded\}/g, vars.urlJsonEncoded)
    .replace(/\{happEncrypted\}/g, vars.happEncrypted)
    .replace(/\{v2raytunEncrypted\}/g, vars.v2raytunEncrypted);
}

/** Build substitution context for a given block from the public sub payload. */
function makeSubstitutionVars(opts: {
  subscriptionUrl: string;
  subscriptionJsonUrl?: string;
  happEncryptedUrl?: string;
  v2raytunEncryptedUrl?: string;
  preferJsonUrl?: boolean;
}): SubstitutionVars {
  const base =
    opts.preferJsonUrl && opts.subscriptionJsonUrl
      ? opts.subscriptionJsonUrl
      : opts.subscriptionUrl;
  return {
    url: base,
    urlEncoded: encodeURIComponent(base),
    b64Url: base ? base64Url(base) : "",
    urlJson: opts.subscriptionJsonUrl ?? "",
    urlJsonEncoded: opts.subscriptionJsonUrl
      ? encodeURIComponent(opts.subscriptionJsonUrl)
      : "",
    happEncrypted: opts.happEncryptedUrl ?? "",
    v2raytunEncrypted: opts.v2raytunEncryptedUrl ?? "",
  };
}

/** Resolve one {@link AppButton} into a rendered button (label + final href). */
function renderButton(
  button: AppButton,
  vars: SubstitutionVars,
): RenderedButton | null {
  if (button.enabled === false) return null;
  const catalog = APP_CATALOG[button.app];
  const label = button.label?.trim() || catalog?.label || button.app;
  const iconUrl = button.iconUrl?.trim() || catalog?.iconUrl || "";

  // Prefer encrypted-specific shortcuts when admin opted in and server gave us one.
  if (button.useEncrypted && catalog?.supportsEncrypted) {
    if (button.app === "happ" && vars.happEncrypted) {
      return {
        id: button.id,
        label,
        href: vars.happEncrypted,
        iconUrl,
        platforms: button.platforms,
        badge: "E2E",
      };
    }
    if (button.app === "v2raytun" && vars.v2raytunEncrypted) {
      return {
        id: button.id,
        label,
        href: vars.v2raytunEncrypted,
        iconUrl,
        platforms: button.platforms,
        badge: "E2E",
      };
    }
  }

  const template =
    (button.deepLinkTemplate && button.deepLinkTemplate.trim()) ||
    catalog?.deepLinkTemplate ||
    "{url}";
  const href = substitute(template, vars);
  if (!href) return null;
  return {
    id: button.id,
    label,
    href,
    iconUrl,
    platforms: button.platforms,
  };
}

export function AddToAppBlock({
  block,
  ctx,
}: {
  block: BlockAddToApp;
  ctx: BlockRenderContext;
}) {
  const { data, interactive, t } = ctx;
  if (!data.subscriptionUrl) return null;

  const normalized = normalizeAddToAppBlock(block);
  const buttons = normalized.buttons ?? [];
  if (buttons.length === 0) return null;

  const vars = makeSubstitutionVars({
    subscriptionUrl: data.subscriptionUrl,
    subscriptionJsonUrl: data.subscriptionJsonUrl,
    happEncryptedUrl: data.happEncryptedUrl,
    v2raytunEncryptedUrl: data.v2raytunEncryptedUrl,
    preferJsonUrl: normalized.preferJsonUrl,
  });

  const rendered = buttons
    .map((b) => renderButton(b, vars))
    .filter((r): r is RenderedButton => r !== null);
  if (rendered.length === 0) return null;

  const title =
    normalized.title?.trim() ||
    t("pages.publicSub.addToApp", { defaultValue: "Add to app" });

  return (
    <div>
      <h2 className={shell.sectionTitle}>{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {rendered.map((link) => (
          <a
            key={link.id}
            href={link.href}
            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-medium text-[#c9d1d9] transition hover:border-[rgba(34,211,238,0.5)] hover:bg-[rgba(34,211,238,0.08)]"
            onClick={(e) => {
              if (!interactive) e.preventDefault();
            }}
          >
            <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white/5 text-[#22d3ee]">
              {link.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={link.iconUrl}
                  alt=""
                  className="size-full object-contain"
                  loading="lazy"
                />
              ) : (
                <Smartphone className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{link.label}</span>
              {link.platforms && link.platforms.length > 0 ? (
                <span className="mt-0.5 block truncate text-[10px] uppercase tracking-wider text-[var(--sub-fg-muted,rgba(201,209,217,0.6))]">
                  {link.platforms.join(" · ")}
                </span>
              ) : null}
            </span>
            {link.badge ? (
              <span className="shrink-0 rounded-full border border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.14)] px-2 py-[1px] text-[10px] font-semibold tracking-wider text-[#22d3ee]">
                {link.badge}
              </span>
            ) : null}
          </a>
        ))}
      </div>
    </div>
  );
}
