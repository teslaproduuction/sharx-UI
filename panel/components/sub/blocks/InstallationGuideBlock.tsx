"use client";

import { ChevronDown, Copy, Download, QrCode, Smartphone, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  APP_CATALOG,
  isSharxV2Config,
  normalizeInstallationGuideBlock,
  type AppViewMode,
  type BlockInstallationGuide,
  type InstallationAppEntry,
  type InstallationPlatform,
  type InstallationStep,
  type PlatformViewMode,
  type StepsViewMode,
  type SubscriptionApp,
  type SupportedPlatform,
} from "@/lib/sharxSubpageConfig";
import { resolveMtProtoLinks } from "../types";
import { PlatformBrandIcon } from "../PlatformBrandIcon";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

const PLATFORM_META: Record<SupportedPlatform, { label: string }> = {
  ios: { label: "iOS" },
  android: { label: "Android" },
  windows: { label: "Windows" },
  macos: { label: "macOS" },
  linux: { label: "Linux" },
  androidtv: { label: "Android TV" },
};

/** Hide Telegram in the app picker unless the subscription includes at least one tg://proxy line. */
function filterVisibleInstallationApps(
  apps: InstallationAppEntry[],
  mtProtoLinks: string[],
): InstallationAppEntry[] {
  return apps.filter((e) => {
    if (e.enabled === false) return false;
    if (e.app === "telegram" && mtProtoLinks.length === 0) return false;
    return true;
  });
}

function platformHasVisibleApps(group: InstallationPlatform, mtProtoLinks: string[]): boolean {
  if (group.enabled === false) return false;
  return filterVisibleInstallationApps(group.apps, mtProtoLinks).length > 0;
}

function InstallationGuideShell({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0">{children}</div>;
}

/**
 * Detect the user's platform from navigator.userAgent.
 * Returns the best match from the `available` list, or the first entry as fallback.
 */
function detectPlatform(available: InstallationPlatform[]): SupportedPlatform {
  const fallback = available[0]?.platform ?? "ios";
  if (typeof navigator === "undefined") return fallback as SupportedPlatform;

  const ua = navigator.userAgent;
  let detected: SupportedPlatform | null = null;

  if (/android/i.test(ua)) {
    detected = /tv|stick|box/i.test(ua) ? "androidtv" : "android";
  } else if (/ipad|iphone|ipod/i.test(ua)) {
    detected = "ios";
  } else if (/win/i.test(ua)) {
    detected = "windows";
  } else if (/mac/i.test(ua)) {
    detected = "macos";
  } else if (/linux/i.test(ua)) {
    detected = "linux";
  }

  if (detected && available.some((g) => g.platform === detected)) {
    return detected;
  }
  return fallback as SupportedPlatform;
}

function base64Url(input: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(input)));
  return Buffer.from(input, "utf-8").toString("base64");
}

function expandTemplate(template: string, url: string): string {
  if (!template || !url) return "";
  return template
    .replace(/\{url\}/g, url)
    .replace(/\{urlEncoded\}/g, encodeURIComponent(url))
    .replace(/\{b64Url\}/g, base64Url(url));
}

function defaultSteps(
  _app: SubscriptionApp,
  appLabel: string,
  hasDownload: boolean,
  t: BlockRenderContext["t"],
): InstallationStep[] {
  return [
    {
      title: t("pages.publicSub.step.install.title", { defaultValue: "Install the app" }),
      text: hasDownload
        ? t("pages.publicSub.step.install.textDownload", { defaultValue: "Download {{app}} using the button below.", app: appLabel })
        : t("pages.publicSub.step.install.textStore", { defaultValue: "Install {{app}} from the official store for your platform.", app: appLabel }),
    },
    {
      title: t("pages.publicSub.step.addSub.title", { defaultValue: "Add subscription" }),
      text: t("pages.publicSub.step.addSub.text", { defaultValue: 'Use the "Add subscription" button below to import automatically, or copy the subscription URL and paste it into the app.' }),
    },
    {
      title: t("pages.publicSub.step.connect.title", { defaultValue: "Connect" }),
      text: t("pages.publicSub.step.connect.text", { defaultValue: "Pick a server and turn the tunnel on. That's it." }),
    },
  ];
}

function defaultTelegramSteps(
  appLabel: string,
  hasDownload: boolean,
  t: BlockRenderContext["t"],
): InstallationStep[] {
  return [
    {
      title: t("pages.publicSub.step.install.title", { defaultValue: "Install the app" }),
      text: hasDownload
        ? t("pages.publicSub.step.install.textDownload", { defaultValue: "Download {{app}} using the button below.", app: appLabel })
        : t("pages.publicSub.step.install.textStore", { defaultValue: "Install {{app}} from the official store for your platform.", app: appLabel }),
    },
    {
      title: t("pages.publicSub.stepTelegram.addProxy.title", { defaultValue: "Add MTProto proxy" }),
      text: t("pages.publicSub.stepTelegram.addProxy.text", {
        defaultValue:
          "Press «Add proxy» (same idea as «Add subscription» for VPN apps). To copy the link, open the QR code — the copy action is there.",
      }),
    },
    {
      title: t("pages.publicSub.stepTelegram.done.title", { defaultValue: "Enable in Telegram" }),
      text: t("pages.publicSub.stepTelegram.done.text", {
        defaultValue: "In Telegram: Settings → Advanced → Connection Type → Use proxy (wording may vary by app version).",
      }),
    },
  ];
}

function getAppMeta(entry: InstallationAppEntry) {
  const catalog = APP_CATALOG[entry.app as SubscriptionApp];
  const label = entry.label?.trim() || catalog?.label || entry.app;
  const deepLinkTemplate =
    entry.deepLinkTemplate?.trim() || catalog?.deepLinkTemplate || "";
  const iconUrl = catalog?.iconUrl?.trim() || "";
  const supportsEncrypted = catalog?.supportsEncrypted === true;
  return { label, deepLinkTemplate, iconUrl, supportsEncrypted };
}

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type DetailProps = {
  entry: InstallationAppEntry;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  showQrCodes: boolean;
  interactive: boolean;
  onCopyLink: (url: string) => void;
  onShowQr: (url: string, title: string) => void;
  happEncryptedUrl?: string;
  v2raytunEncryptedUrl?: string;
  /** Parsed `tg://proxy…` lines from the subscription (Telemt). */
  tgProxyLinks: string[];
  t: BlockRenderContext["t"];
  stepsView: StepsViewMode;
};

type StepAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  primary?: boolean;
  badge?: string;
  external?: boolean;
};

function resolveStepActions(
  steps: InstallationStep[],
  opts: {
    hasDownload: boolean;
    downloadUrl?: string;
    showDeeplinks: boolean;
    addHref: string;
    isEncrypted: boolean;
    subscriptionUrl: string;
    onCopyLink: (url: string) => void;
    t: BlockRenderContext["t"];
    /** Overrides "Add subscription" button label (e.g. Open in Telegram). */
    addPrimaryLabel?: string;
    /**
     * Telegram MTProto: show «Add proxy» even when the block has showDeeplinks off
     * (that toggle is for VPN subscription import links; tg:// is different).
     */
    forceShowPrimaryDeeplink?: boolean;
    /** URL for step-2 copy fallback; for telegram prefer first tg:// line instead of HTTP /sub/ URL. */
    step1CopyUrl?: string;
  },
): (StepAction | null)[] {
  return steps.map((_s: InstallationStep, i: number) => {
    if (i === 0 && opts.hasDownload) {
      return {
        label: opts.t("pages.publicSub.installStore", { defaultValue: "Download" }),
        href: opts.downloadUrl,
        icon: <Download className="size-3.5" />,
        external: true,
      };
    }
    const showPrimary =
      !!opts.addHref &&
      (opts.showDeeplinks || opts.forceShowPrimaryDeeplink === true);
    if (i === 1 && showPrimary) {
      return {
        label:
          opts.addPrimaryLabel ??
          opts.t("pages.publicSub.addSubscription", { defaultValue: "Add subscription" }),
        href: opts.addHref,
        icon: <Zap className="size-3.5" />,
        primary: true,
        badge: opts.isEncrypted ? "E2E" : undefined,
      };
    }
    if (i === 1) {
      const copyUrl = opts.step1CopyUrl ?? opts.subscriptionUrl;
      const isTg = copyUrl.trim().toLowerCase().startsWith("tg://");
      return {
        label: isTg
          ? opts.t("pages.publicSub.copyProxyLink", { defaultValue: "Copy proxy link" })
          : opts.t("pages.publicSub.copySubscription", { defaultValue: "Copy link" }),
        onClick: () => opts.onCopyLink(copyUrl),
        icon: <Copy className="size-3.5" />,
      };
    }
    return null;
  });
}

function ActionButton({
  action,
  interactive,
}: {
  action: StepAction;
  interactive: boolean;
}) {
  if (action.href) {
    return (
      <a
        href={action.href}
        target={action.external ? "_blank" : undefined}
        rel={action.external ? "noreferrer" : undefined}
        onClick={(e) => { if (!interactive) e.preventDefault(); }}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
          action.primary
            ? "border-[color-mix(in_oklab,var(--sub-accent)_45%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.1))] text-[var(--sub-accent,#22d3ee)] hover:border-[color-mix(in_oklab,var(--sub-accent)_70%,transparent)]"
            : "border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-fg,#c9d1d9)] hover:border-[color-mix(in_oklab,var(--sub-accent)_45%,transparent)] hover:bg-[var(--sub-accent-soft,rgba(34,211,238,0.1))]"
        }`}
      >
        {action.icon}
        {action.label}
        {action.badge ? (
          <span className="rounded-full border border-[color-mix(in_oklab,var(--sub-accent)_35%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] px-1.5 py-[1px] text-[9px] font-semibold tracking-wider">
            {action.badge}
          </span>
        ) : null}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => { if (interactive && action.onClick) action.onClick(); }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] px-3 py-1.5 text-[12px] font-medium text-[var(--sub-fg,#c9d1d9)] transition hover:border-[color-mix(in_oklab,var(--sub-accent)_45%,transparent)] hover:bg-[var(--sub-accent-soft,rgba(34,211,238,0.1))]"
    >
      {action.icon}
      {action.label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Steps view modes
// ---------------------------------------------------------------------------

type StepsSharedProps = {
  steps: InstallationStep[];
  actions: (StepAction | null)[];
  interactive: boolean;
  showQrCodes: boolean;
  qrUrl: string;
  qrLabel: string;
  onShowQr: (url: string, title: string) => void;
};

function QrIconButton({ qrUrl, qrLabel, interactive, onShowQr }: {
  qrUrl: string;
  qrLabel: string;
  interactive: boolean;
  onShowQr: (url: string, title: string) => void;
}) {
  return (
    <button
      type="button"
      style={{cursor: "pointer"}}
      onClick={() => { if (interactive) onShowQr(qrUrl, qrLabel); }}
      className="grid size-[30px] shrink-0 place-items-center rounded-lg border border-[color-mix(in_oklab,var(--sub-accent)_45%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.1))] text-[var(--sub-accent,#22d3ee)] transition hover:border-[color-mix(in_oklab,var(--sub-accent)_70%,transparent)]"
    >
      <QrCode className="size-3.5" />
    </button>
  );
}

function StepsTimeline({ steps, actions, interactive, showQrCodes, qrUrl, qrLabel, onShowQr }: StepsSharedProps) {
  return (
    <ol className="relative flex flex-col gap-0 ml-[15px]">
      {steps.map((s: InstallationStep, i: number) => {
        const action = actions[i];
        const showQr = showQrCodes && qrUrl && i === 1;
        return (
          <li key={i} className="relative pb-5 pl-6 last:pb-0 last:before:hidden before:absolute before:left-[-2px] before:top-4 before:bottom-0 before:w-[2px] before:bg-[var(--sub-border,rgba(255,255,255,0.08))]">
            <span className="absolute -left-[11px] top-0.5 flex size-5 items-center justify-center rounded-full border-2 border-[var(--sub-accent,#22d3ee)] bg-[var(--sub-bg,#161b22)] text-[10px] font-bold text-[var(--sub-accent,#22d3ee)]">
              {i + 1}
            </span>
            <div className="rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] p-3">
              {s.title?.trim() ? (
                <div className="mb-1 text-[13px] font-semibold text-[var(--sub-fg-strong,#fff)]">
                  {s.title}
                </div>
              ) : null}
              {s.text?.trim() ? (
                <p className="text-[12px] leading-relaxed text-[var(--sub-fg-muted,#8b949e)]">
                  {s.text}
                </p>
              ) : null}
              {(action || showQr) ? (
                <div className="mt-2.5 flex items-center gap-2">
                  {action ? <ActionButton action={action} interactive={interactive} /> : null}
                  {showQr ? <QrIconButton qrUrl={qrUrl} qrLabel={qrLabel} interactive={interactive} onShowQr={onShowQr} /> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepsNumbered({ steps, actions, interactive, showQrCodes, qrUrl, qrLabel, onShowQr }: StepsSharedProps) {
  return (
    <div>
      <ol className="mb-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-[var(--sub-fg-muted,#8b949e)] marker:text-[var(--sub-accent,#22d3ee)]">
        {steps.map((s: InstallationStep, i: number) => (
          <li key={i}>
            {s.title?.trim() ? (
              <span className="font-medium text-[var(--sub-fg,#c9d1d9)]">{s.title}</span>
            ) : null}
            {s.title?.trim() && s.text?.trim() ? " — " : null}
            {s.text}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action, i) =>
          action ? <ActionButton key={i} action={action} interactive={interactive} /> : null,
        )}
        {showQrCodes && qrUrl ? (
          <QrIconButton qrUrl={qrUrl} qrLabel={qrLabel} interactive={interactive} onShowQr={onShowQr} />
        ) : null}
      </div>
    </div>
  );
}

function StepsPlain({ steps, actions, interactive, showQrCodes, qrUrl, qrLabel, onShowQr }: StepsSharedProps) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2">
        {steps.map((s: InstallationStep, i: number) => (
          <div key={i} className="text-[13px] leading-relaxed text-[var(--sub-fg-muted,#8b949e)]">
            {s.title?.trim() ? (
              <span className="font-medium text-[var(--sub-fg,#c9d1d9)]">{s.title}: </span>
            ) : null}
            {s.text}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action, i) =>
          action ? <ActionButton key={i} action={action} interactive={interactive} /> : null,
        )}
        {showQrCodes && qrUrl ? (
          <QrIconButton qrUrl={qrUrl} qrLabel={qrLabel} interactive={interactive} onShowQr={onShowQr} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App detail: resolves deep links / steps, delegates to the chosen steps view
// ---------------------------------------------------------------------------

function SelectedAppDetail(props: DetailProps) {
  const {
    entry,
    subscriptionUrl,
    showDeeplinks,
    showQrCodes,
    interactive,
    onCopyLink,
    onShowQr,
    happEncryptedUrl,
    v2raytunEncryptedUrl,
    tgProxyLinks,
    t,
    stepsView,
  } = props;
  const { label, deepLinkTemplate, iconUrl, supportsEncrypted } = getAppMeta(entry);

  let addHref = expandTemplate(deepLinkTemplate, subscriptionUrl);
  let isEncrypted = false;
  if (entry.app === "telegram") {
    addHref = tgProxyLinks[0] ?? "";
    isEncrypted = false;
  } else if (entry.useEncrypted && supportsEncrypted) {
    if (entry.app === "happ" && happEncryptedUrl) {
      addHref = happEncryptedUrl;
      isEncrypted = true;
    } else if (entry.app === "v2raytun" && v2raytunEncryptedUrl) {
      addHref = v2raytunEncryptedUrl;
      isEncrypted = true;
    }
  }
  const qrUrl = addHref || subscriptionUrl;
  const hasDownload = !!entry.downloadUrl?.trim();
  const steps =
    entry.steps && entry.steps.length > 0
      ? entry.steps
      : entry.app === "telegram"
        ? defaultTelegramSteps(label, hasDownload, t)
        : defaultSteps(entry.app, label, hasDownload, t);

  const actions = resolveStepActions(steps, {
    hasDownload,
    downloadUrl: entry.downloadUrl,
    showDeeplinks,
    addHref,
    isEncrypted,
    subscriptionUrl,
    onCopyLink,
    t,
    addPrimaryLabel:
      entry.app === "telegram"
        ? t("pages.publicSub.mtproto.addProxy", { defaultValue: "Add proxy" })
        : undefined,
    forceShowPrimaryDeeplink:
      entry.app === "telegram" && !!addHref,
    step1CopyUrl:
      entry.app === "telegram" && tgProxyLinks.length > 0 ? tgProxyLinks[0] : undefined,
  });

  return (
    <div className="mt-1">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-accent,#22d3ee)]">
          {iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconUrl} alt="" className="size-full object-contain" loading="lazy" />
          ) : (
            <Smartphone className="size-4" />
          )}
        </span>
        <span className="text-sm font-semibold text-[var(--sub-fg-strong,#fff)]">{label}</span>
        {isEncrypted ? (
          <span className="rounded-full border border-[color-mix(in_oklab,var(--sub-accent)_35%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] px-1.5 py-[1px] text-[9px] font-semibold tracking-wider text-[var(--sub-accent,#22d3ee)]">
            E2E
          </span>
        ) : null}
      </div>

      {stepsView === "timeline" ? (
        <StepsTimeline steps={steps} actions={actions} interactive={interactive} showQrCodes={showQrCodes} qrUrl={qrUrl} qrLabel={label} onShowQr={onShowQr} />
      ) : stepsView === "numbered" ? (
        <StepsNumbered steps={steps} actions={actions} interactive={interactive} showQrCodes={showQrCodes} qrUrl={qrUrl} qrLabel={label} onShowQr={onShowQr} />
      ) : (
        <StepsPlain steps={steps} actions={actions} interactive={interactive} showQrCodes={showQrCodes} qrUrl={qrUrl} qrLabel={label} onShowQr={onShowQr} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App selector modes: chips, list, dropdown
// ---------------------------------------------------------------------------

function AppChip({
  entry,
  isActive,
  onClick,
}: {
  entry: InstallationAppEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const { label, iconUrl } = getAppMeta(entry);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-medium transition ${
        isActive
          ? "border-[var(--sub-accent,rgba(34,211,238,0.55))] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] text-[var(--sub-accent,#22d3ee)]"
          : "border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-fg,#c9d1d9)] hover:border-[var(--sub-border,rgba(255,255,255,0.15))]"
      }`}
    >
      <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded text-[var(--sub-accent,#22d3ee)]">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="size-full object-contain" loading="lazy" />
        ) : (
          <Smartphone className="size-3" />
        )}
      </span>
      {label}
    </button>
  );
}

function AppListItem({
  entry,
  isActive,
  onClick,
}: {
  entry: InstallationAppEntry;
  isActive: boolean;
  onClick: () => void;
}) {
  const { label, iconUrl } = getAppMeta(entry);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition ${
        isActive
          ? "border-[var(--sub-accent,rgba(34,211,238,0.55))] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] text-[var(--sub-accent,#22d3ee)]"
          : "border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-fg,#c9d1d9)] hover:border-[var(--sub-border,rgba(255,255,255,0.15))]"
      }`}
    >
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded text-[var(--sub-accent,#22d3ee)]">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="size-full object-contain" loading="lazy" />
        ) : (
          <Smartphone className="size-3.5" />
        )}
      </span>
      {label}
    </button>
  );
}

function AppDropdownSelector({
  apps,
  selectedIdx,
  onSelect,
}: {
  apps: InstallationAppEntry[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
}) {
  const current = apps[selectedIdx];
  const { iconUrl } = current ? getAppMeta(current) : { iconUrl: "" };

  return (
    <div className="relative">
      <select
        value={selectedIdx}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="w-full appearance-none rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] py-2.5 pl-10 pr-8 text-[13px] font-medium text-[var(--sub-fg,#c9d1d9)] outline-none transition focus:border-[var(--sub-accent,rgba(34,211,238,0.55))]"
      >
        {apps.map((entry: InstallationAppEntry, i: number) => {
          const meta = getAppMeta(entry);
          return (
            <option key={`${entry.app}-${i}`} value={i}>
              {meta.label}
            </option>
          );
        })}
      </select>
      <span className="pointer-events-none absolute left-3 top-1/2 grid -translate-y-1/2 size-5 place-items-center overflow-hidden rounded text-[var(--sub-accent,#22d3ee)]">
        {iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={iconUrl} alt="" className="size-full object-contain" loading="lazy" />
        ) : (
          <Smartphone className="size-3" />
        )}
      </span>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--sub-fg-muted,#8b949e)]" />
    </div>
  );
}

function AppSelector({
  apps,
  selectedIdx,
  onSelect,
  appView,
}: {
  apps: InstallationAppEntry[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  appView: AppViewMode;
}) {
  if (apps.length <= 1) return null;

  if (appView === "list") {
    return (
      <div className="mb-3 flex flex-col gap-1.5">
        {apps.map((entry: InstallationAppEntry, i: number) => (
          <AppListItem
            key={`${entry.app}-${i}`}
            entry={entry}
            isActive={i === selectedIdx}
            onClick={() => onSelect(i)}
          />
        ))}
      </div>
    );
  }

  if (appView === "dropdown") {
    return (
      <div className="mb-3">
        <AppDropdownSelector apps={apps} selectedIdx={selectedIdx} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {apps.map((entry: InstallationAppEntry, i: number) => (
        <AppChip
          key={`${entry.app}-${i}`}
          entry={entry}
          isActive={i === selectedIdx}
          onClick={() => onSelect(i)}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform + App combined content (used inside each platform view mode)
// ---------------------------------------------------------------------------

type PlatformContentProps = {
  group: InstallationPlatform;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  showQrCodes: boolean;
  interactive: boolean;
  onCopyLink: (url: string) => void;
  onShowQr: (url: string, title: string) => void;
  happEncryptedUrl?: string;
  v2raytunEncryptedUrl?: string;
  mtProtoLinks: string[];
  t: BlockRenderContext["t"];
  appView: AppViewMode;
  stepsView: StepsViewMode;
};

function PlatformContent(props: PlatformContentProps) {
  const {
    group,
    subscriptionUrl,
    showDeeplinks,
    showQrCodes,
    interactive,
    onCopyLink,
    onShowQr,
    happEncryptedUrl,
    v2raytunEncryptedUrl,
    mtProtoLinks,
    t,
    appView,
    stepsView,
  } = props;
  const visibleApps = useMemo(
    () => filterVisibleInstallationApps(group.apps, mtProtoLinks),
    [group.apps, mtProtoLinks],
  );
  const [selectedIdx, setSelectedIdx] = useState(0);
  useEffect(() => {
    if (visibleApps.length === 0) {
      setSelectedIdx(0);
      return;
    }
    setSelectedIdx((i) => Math.min(i, visibleApps.length - 1));
  }, [visibleApps.length]);
  const selectedApp = visibleApps[selectedIdx] ?? visibleApps[0];

  return (
    <div>
      {group.intro?.trim() ? (
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--sub-fg-muted,#8b949e)]">{group.intro}</p>
      ) : null}

      <AppSelector
        apps={visibleApps}
        selectedIdx={selectedIdx}
        onSelect={setSelectedIdx}
        appView={appView}
      />

      {selectedApp ? (
        <SelectedAppDetail
          entry={selectedApp}
          subscriptionUrl={subscriptionUrl}
          showDeeplinks={showDeeplinks}
          showQrCodes={showQrCodes}
          interactive={interactive}
          onCopyLink={onCopyLink}
          onShowQr={onShowQr}
          happEncryptedUrl={happEncryptedUrl}
          v2raytunEncryptedUrl={v2raytunEncryptedUrl}
          tgProxyLinks={mtProtoLinks}
          t={t}
          stepsView={stepsView}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform view modes
// ---------------------------------------------------------------------------

type GuideProps = {
  groups: InstallationPlatform[];
  title: string;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  showQrCodes: boolean;
  interactive: boolean;
  onCopyLink: (url: string) => void;
  onShowQr: (url: string, title: string) => void;
  happEncryptedUrl?: string;
  v2raytunEncryptedUrl?: string;
  t: BlockRenderContext["t"];
  platformView: PlatformViewMode;
  appView: AppViewMode;
  stepsView: StepsViewMode;
  mtProtoLinks: string[];
};

function PlatformTabs(props: GuideProps) {
  const {
    groups,
    title,
    platformView: _pv,
    appView,
    stepsView,
    mtProtoLinks,
    ...rest
  } = props;
  void _pv;
  const enabled: InstallationPlatform[] = groups.filter((g: InstallationPlatform) =>
    platformHasVisibleApps(g, mtProtoLinks),
  );
  const [activePlatform, setActivePlatform] = useState<SupportedPlatform>(
    () => detectPlatform(enabled),
  );

  if (enabled.length === 0) return null;

  const current = enabled.find((g) => g.platform === activePlatform) ?? enabled[0]!;

  return (
    <InstallationGuideShell>
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {enabled.map((g: InstallationPlatform) => {
            const plat = g.platform as SupportedPlatform;
            const meta = PLATFORM_META[plat];
            const isActive = plat === current.platform;
            return (
              <button
                key={plat}
                type="button"
                onClick={() => setActivePlatform(plat)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
                  isActive
                    ? "border-[color-mix(in_oklab,var(--sub-accent)_55%,transparent)] bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] text-[var(--sub-accent,#22d3ee)]"
                    : "border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-fg,#c9d1d9)] hover:border-[var(--sub-border,rgba(255,255,255,0.15))]"
                }`}
              >
                <PlatformBrandIcon platform={plat} className="size-3.5" />
                {meta?.label ?? plat}
              </button>
            );
          })}
        </div>

        <PlatformContent
          key={current.platform}
          group={current}
          appView={appView}
          stepsView={stepsView}
          mtProtoLinks={mtProtoLinks}
          {...rest}
        />
      </div>
    </InstallationGuideShell>
  );
}

function PlatformDropdown(props: GuideProps) {
  const {
    groups,
    title,
    platformView: _pv,
    appView,
    stepsView,
    mtProtoLinks,
    ...rest
  } = props;
  void _pv;
  const enabled: InstallationPlatform[] = groups.filter((g: InstallationPlatform) =>
    platformHasVisibleApps(g, mtProtoLinks),
  );
  const [activePlatform, setActivePlatform] = useState<SupportedPlatform>(
    () => detectPlatform(enabled),
  );

  if (enabled.length === 0) return null;

  const current = enabled.find((g) => g.platform === activePlatform) ?? enabled[0]!;

  return (
    <InstallationGuideShell>
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>

        <div className="relative mb-3">
          <select
            value={current.platform}
            onChange={(e) => setActivePlatform(e.target.value as SupportedPlatform)}
            className="w-full appearance-none rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] py-2.5 pl-10 pr-8 text-[13px] font-medium text-[var(--sub-fg,#c9d1d9)] outline-none transition focus:border-[var(--sub-accent,rgba(34,211,238,0.55))]"
          >
            {enabled.map((g: InstallationPlatform) => {
              const plat = g.platform as SupportedPlatform;
              const meta = PLATFORM_META[plat];
              return (
                <option key={plat} value={plat}>
                  {meta?.label ?? plat}
                </option>
              );
            })}
          </select>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sub-accent,#22d3ee)]">
            <PlatformBrandIcon platform={current.platform as SupportedPlatform} className="size-4" />
          </span>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--sub-fg-muted,#8b949e)]" />
        </div>

        <PlatformContent
          key={current.platform}
          group={current}
          appView={appView}
          stepsView={stepsView}
          mtProtoLinks={mtProtoLinks}
          {...rest}
        />
      </div>
    </InstallationGuideShell>
  );
}

function PlatformPills(props: GuideProps) {
  const {
    groups,
    title,
    platformView: _pv,
    appView,
    stepsView,
    mtProtoLinks,
    ...rest
  } = props;
  void _pv;
  const enabled: InstallationPlatform[] = groups.filter((g: InstallationPlatform) =>
    platformHasVisibleApps(g, mtProtoLinks),
  );
  const [activePlatform, setActivePlatform] = useState<SupportedPlatform>(
    () => detectPlatform(enabled),
  );

  if (enabled.length === 0) return null;

  const current = enabled.find((g) => g.platform === activePlatform) ?? enabled[0]!;

  return (
    <InstallationGuideShell>
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>

        <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-[var(--sub-border,rgba(255,255,255,0.08))]">
          {enabled.map((g: InstallationPlatform) => {
            const plat = g.platform as SupportedPlatform;
            const meta = PLATFORM_META[plat];
            const isActive = plat === current.platform;
            return (
              <button
                key={plat}
                type="button"
                onClick={() => setActivePlatform(plat)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition ${
                  isActive
                    ? "bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] text-[var(--sub-accent,#22d3ee)]"
                    : "bg-[var(--sub-surface,rgba(255,255,255,0.04))] text-[var(--sub-fg,#c9d1d9)] hover:bg-[var(--sub-surface,rgba(255,255,255,0.08))]"
                }`}
              >
                <PlatformBrandIcon platform={plat} className="size-3.5" />
                {meta?.label ?? plat}
              </button>
            );
          })}
        </div>

        <PlatformContent
          key={current.platform}
          group={current}
          appView={appView}
          stepsView={stepsView}
          mtProtoLinks={mtProtoLinks}
          {...rest}
        />
      </div>
    </InstallationGuideShell>
  );
}

function PlatformAccordion(props: GuideProps) {
  const {
    groups,
    title,
    platformView: _pv,
    appView,
    stepsView,
    mtProtoLinks,
    ...rest
  } = props;
  void _pv;
  const enabled: InstallationPlatform[] = groups.filter((g: InstallationPlatform) =>
    platformHasVisibleApps(g, mtProtoLinks),
  );

  if (enabled.length === 0) return null;

  return (
    <InstallationGuideShell>
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>
        <div className="flex flex-col gap-2">
          {enabled.map((g: InstallationPlatform, gi: number) => {
            const plat = g.platform as SupportedPlatform;
            const meta = PLATFORM_META[plat];
            const visibleCount = filterVisibleInstallationApps(g.apps, mtProtoLinks).length;
            return (
              <details
                key={plat}
                className="group rounded-xl border border-[var(--sub-border,rgba(255,255,255,0.08))] bg-[var(--sub-surface,rgba(255,255,255,0.04))] px-4 py-3"
                open={gi === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-[var(--sub-fg,#c9d1d9)] [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <PlatformBrandIcon platform={plat} className="size-4" />
                    {meta?.label ?? plat}
                  </span>
                  <span className="text-xs text-[var(--sub-fg-subtle,#6e7681)]">{visibleCount}</span>
                </summary>
                <div className="mt-3">
                  <PlatformContent
                    group={g}
                    appView={appView}
                    stepsView={stepsView}
                    mtProtoLinks={mtProtoLinks}
                    {...rest}
                  />
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </InstallationGuideShell>
  );
}

// ---------------------------------------------------------------------------
// Main export: resolves view mode settings and renders
// ---------------------------------------------------------------------------

function resolveModes(
  normalized: BlockInstallationGuide,
): { platformView: PlatformViewMode; appView: AppViewMode; stepsView: StepsViewMode } {
  if (normalized.platformView) {
    return {
      platformView: normalized.platformView,
      appView: normalized.appView ?? "chips",
      stepsView: normalized.stepsView ?? "timeline",
    };
  }

  switch (normalized.style) {
    case "accordion":
      return { platformView: "accordion", appView: "chips", stepsView: "timeline" };
    case "timeline":
      return { platformView: "tabs", appView: "chips", stepsView: "timeline" };
    case "cards":
      return { platformView: "tabs", appView: "chips", stepsView: "numbered" };
    case "minimal":
      return { platformView: "tabs", appView: "chips", stepsView: "plain" };
    default:
      return { platformView: "tabs", appView: "chips", stepsView: "timeline" };
  }
}

export function InstallationGuideBlock({
  block,
  ctx,
}: {
  block: BlockInstallationGuide;
  ctx: BlockRenderContext;
}) {
  const { data, showQrCodes, interactive, t } = ctx;
  const normalized = normalizeInstallationGuideBlock(block);
  const groups = normalized.groups ?? [];
  const title =
    normalized.title?.trim() ||
    t("pages.publicSub.installation", { defaultValue: "Installation guide" });
  const showDeeplinks = normalized.showDeeplinks !== false;
  const subscriptionUrl = data.subscriptionUrl || "";
  const onCopyLink = ctx.onCopyLink;
  const onShowQr = ctx.onShowQr;
  const happEncryptedUrl = data.happEncryptedUrl;
  const v2raytunEncryptedUrl = data.v2raytunEncryptedUrl;

  const { platformView, appView, stepsView } = resolveModes(normalized);

  const rr = isSharxV2Config(data.config) ? data.config.responseRules : undefined;
  const mtProtoEnabled = rr?.mtProtoEnabled !== false;
  const mtProtoLinks = mtProtoEnabled ? resolveMtProtoLinks(data) : [];

  const guideProps: GuideProps = {
    groups,
    title,
    subscriptionUrl,
    showDeeplinks,
    showQrCodes,
    interactive,
    onCopyLink,
    onShowQr,
    happEncryptedUrl,
    v2raytunEncryptedUrl,
    t,
    platformView,
    appView,
    stepsView,
    mtProtoLinks,
  };

  switch (platformView) {
    case "dropdown":
      return <PlatformDropdown {...guideProps} />;
    case "pills":
      return <PlatformPills {...guideProps} />;
    case "accordion":
      return <PlatformAccordion {...guideProps} />;
    default:
      return <PlatformTabs {...guideProps} />;
  }
}
