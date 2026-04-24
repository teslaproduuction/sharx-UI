"use client";

import {
  Apple,
  Download,
  Monitor,
  Smartphone,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import {
  APP_CATALOG,
  normalizeInstallationGuideBlock,
  type BlockInstallationGuide,
  type InstallationAppEntry,
  type InstallationPlatform,
  type InstallationStep,
  type SubscriptionApp,
  type SupportedPlatform,
} from "@/lib/sharxSubpageConfig";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

type PlatformMeta = {
  label: string;
  icon: LucideIcon;
};

const PLATFORM_META: Record<SupportedPlatform, PlatformMeta> = {
  ios: { label: "iOS", icon: Apple },
  android: { label: "Android", icon: Smartphone },
  windows: { label: "Windows", icon: Monitor },
  macos: { label: "macOS", icon: Apple },
  linux: { label: "Linux", icon: Monitor },
  androidtv: { label: "Android TV", icon: Tv },
};

function base64Url(input: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(input)));
  return Buffer.from(input, "utf-8").toString("base64");
}

/** Substitute deep-link template variables from APP_CATALOG. */
function expandTemplate(template: string, url: string): string {
  if (!template || !url) return "";
  return template
    .replace(/\{url\}/g, url)
    .replace(/\{urlEncoded\}/g, encodeURIComponent(url))
    .replace(/\{b64Url\}/g, base64Url(url));
}

/** Default per-app steps used when the admin hasn't customized them. */
function defaultSteps(
  app: SubscriptionApp,
  appLabel: string,
  hasDownload: boolean,
): InstallationStep[] {
  const base: InstallationStep[] = [
    {
      title: "Install the app",
      text: hasDownload
        ? `Download ${appLabel} using the button above.`
        : `Install ${appLabel} from the official store for your platform.`,
    },
    {
      title: "Add subscription",
      text: "Tap the \"Add subscription\" button — it opens the app and imports automatically. Or copy the subscription URL from the header and paste it in.",
    },
    {
      title: "Connect",
      text: "Pick a server and turn the tunnel on. That's it.",
    },
  ];
  void app;
  return base;
}

function getAppMeta(entry: InstallationAppEntry) {
  const catalog = APP_CATALOG[entry.app];
  const label = entry.label?.trim() || catalog?.label || entry.app;
  const deepLinkTemplate = catalog?.deepLinkTemplate || "";
  return { label, deepLinkTemplate };
}

/** Card for one app inside a platform group. */
function AppCard({
  entry,
  subscriptionUrl,
  showDeeplinks,
  interactive,
  t,
}: {
  entry: InstallationAppEntry;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  interactive: boolean;
  t: BlockRenderContext["t"];
}) {
  const { label, deepLinkTemplate } = getAppMeta(entry);
  const addHref = expandTemplate(deepLinkTemplate, subscriptionUrl);
  const hasDownload = !!entry.downloadUrl?.trim();
  const steps =
    entry.steps && entry.steps.length > 0
      ? entry.steps
      : defaultSteps(entry.app, label, hasDownload);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-[#22d3ee]">
            <Smartphone className="size-4" />
          </span>
          <span className="truncate text-sm font-semibold text-[#c9d1d9]">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {hasDownload ? (
            <a
              href={entry.downloadUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                if (!interactive) e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-[#c9d1d9] transition hover:border-[rgba(34,211,238,0.45)] hover:bg-[rgba(34,211,238,0.1)]"
            >
              <Download className="size-3" />
              {t("pages.publicSub.installStore", { defaultValue: "Install" })}
            </a>
          ) : null}
          {showDeeplinks && addHref ? (
            <a
              href={addHref}
              onClick={(e) => {
                if (!interactive) e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(34,211,238,0.45)] bg-[rgba(34,211,238,0.1)] px-2.5 py-1 text-[11px] font-medium text-[#22d3ee] transition hover:border-[rgba(34,211,238,0.7)]"
            >
              <Zap className="size-3" />
              {t("pages.publicSub.addSubscription", { defaultValue: "Add subscription" })}
            </a>
          ) : null}
        </div>
      </header>
      <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-[#8b949e] marker:text-[#22d3ee]">
        {steps.map((s, i) => (
          <li key={i}>
            {s.title?.trim() ? (
              <span className="font-medium text-[#c9d1d9]">{s.title}</span>
            ) : null}
            {s.title?.trim() && s.text?.trim() ? " — " : null}
            {s.text}
          </li>
        ))}
      </ol>
    </article>
  );
}

/** Stepper style: platform tabs → app cards grid. */
function StepperGuide({
  groups,
  title,
  subscriptionUrl,
  showDeeplinks,
  interactive,
  t,
}: {
  groups: InstallationPlatform[];
  title: string;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  interactive: boolean;
  t: BlockRenderContext["t"];
}) {
  const enabled = groups.filter((g) => g.enabled !== false && g.apps.length > 0);
  const [active, setActive] = useState<SupportedPlatform>(
    enabled[0]?.platform ?? "ios",
  );
  if (enabled.length === 0) return null;
  const current =
    enabled.find((g) => g.platform === active) ?? enabled[0]!;

  return (
    <div>
      <h2 className={shell.sectionTitle}>{title}</h2>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {enabled.map((g) => {
          const meta = PLATFORM_META[g.platform];
          const Icon = meta?.icon ?? Smartphone;
          const isActive = g.platform === current.platform;
          return (
            <button
              key={g.platform}
              type="button"
              onClick={() => setActive(g.platform)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition ${
                isActive
                  ? "border-[rgba(34,211,238,0.55)] bg-[rgba(34,211,238,0.14)] text-[#22d3ee]"
                  : "border-white/10 bg-white/5 text-[#c9d1d9] hover:border-white/20"
              }`}
            >
              <Icon className="size-3.5" />
              {meta?.label ?? g.platform}
            </button>
          );
        })}
      </div>
      {current.intro?.trim() ? (
        <p className="mb-3 text-[13px] leading-relaxed text-[#8b949e]">{current.intro}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {current.apps.map((entry, i) => (
          <AppCard
            key={`${entry.app}-${i}`}
            entry={entry}
            subscriptionUrl={subscriptionUrl}
            showDeeplinks={showDeeplinks}
            interactive={interactive}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

/** Compact summary for "minimal" style: one chip per platform. */
function MinimalGuide({
  groups,
  title,
}: {
  groups: InstallationPlatform[];
  title: string;
}) {
  const enabled = groups.filter((g) => g.enabled !== false);
  if (enabled.length === 0) return null;
  return (
    <div>
      <h2 className={shell.sectionTitle}>{title}</h2>
      <ul className="flex flex-wrap gap-2 text-[12px] text-[#8b949e]">
        {enabled.map((g) => {
          const meta = PLATFORM_META[g.platform];
          const Icon = meta?.icon ?? Smartphone;
          return (
            <li
              key={g.platform}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[#c9d1d9]"
            >
              <Icon className="size-3.5" />
              {meta?.label ?? g.platform}
              <span className="ml-1 text-[10px] text-[#6e7681]">
                {g.apps.length ? `· ${g.apps.length}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Accordion / cards / timeline all follow platform-as-outer-group layout. */
function GroupedGuide({
  style,
  groups,
  title,
  subscriptionUrl,
  showDeeplinks,
  interactive,
  t,
}: {
  style: "cards" | "accordion" | "timeline";
  groups: InstallationPlatform[];
  title: string;
  subscriptionUrl: string;
  showDeeplinks: boolean;
  interactive: boolean;
  t: BlockRenderContext["t"];
}) {
  const enabled = groups.filter((g) => g.enabled !== false && g.apps.length > 0);
  if (enabled.length === 0) return null;

  if (style === "accordion") {
    return (
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>
        <div className="flex flex-col gap-2">
          {enabled.map((g, gi) => {
            const meta = PLATFORM_META[g.platform];
            const Icon = meta?.icon ?? Smartphone;
            return (
              <details
                key={g.platform}
                className="group rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                open={gi === 0}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm text-[#c9d1d9] [&::-webkit-details-marker]:hidden">
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-4 text-[#22d3ee]" />
                    {meta?.label ?? g.platform}
                  </span>
                  <span className="text-xs text-[#6e7681]">{g.apps.length}</span>
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {g.apps.map((entry, i) => (
                    <AppCard
                      key={`${entry.app}-${i}`}
                      entry={entry}
                      subscriptionUrl={subscriptionUrl}
                      showDeeplinks={showDeeplinks}
                      interactive={interactive}
                      t={t}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    );
  }

  if (style === "timeline") {
    return (
      <div>
        <h2 className={shell.sectionTitle}>{title}</h2>
        <ol className="flex flex-col gap-6 border-l border-white/10 pl-4">
          {enabled.map((g) => {
            const meta = PLATFORM_META[g.platform];
            const Icon = meta?.icon ?? Smartphone;
            return (
              <li key={g.platform} className="relative">
                <span className="absolute -left-[22px] top-0 flex size-4 items-center justify-center rounded-full border border-[#22d3ee]/60 bg-[#161b22]">
                  <Icon className="size-2.5 text-[#22d3ee]" />
                </span>
                <div className="mb-3 text-sm font-semibold text-[#c9d1d9]">
                  {meta?.label ?? g.platform}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {g.apps.map((entry, i) => (
                    <AppCard
                      key={`${entry.app}-${i}`}
                      entry={entry}
                      subscriptionUrl={subscriptionUrl}
                      showDeeplinks={showDeeplinks}
                      interactive={interactive}
                      t={t}
                    />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // cards
  return (
    <div>
      <h2 className={shell.sectionTitle}>{title}</h2>
      <div className="flex flex-col gap-5">
        {enabled.map((g) => {
          const meta = PLATFORM_META[g.platform];
          const Icon = meta?.icon ?? Smartphone;
          return (
            <section key={g.platform}>
              <div className="mb-2 inline-flex items-center gap-2 text-[#c9d1d9]">
                <Icon className="size-4 text-[#22d3ee]" />
                <span className="text-sm font-semibold">{meta?.label ?? g.platform}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.apps.map((entry, i) => (
                  <AppCard
                    key={`${entry.app}-${i}`}
                    entry={entry}
                    subscriptionUrl={subscriptionUrl}
                    showDeeplinks={showDeeplinks}
                    interactive={interactive}
                    t={t}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function InstallationGuideBlock({
  block,
  ctx,
}: {
  block: BlockInstallationGuide;
  ctx: BlockRenderContext;
}) {
  const { data, interactive, t } = ctx;
  const normalized = normalizeInstallationGuideBlock(block);
  const groups = normalized.groups ?? [];
  const title =
    normalized.title?.trim() ||
    t("pages.publicSub.installation", { defaultValue: "Installation guide" });
  const showDeeplinks = normalized.showDeeplinks !== false;
  const subscriptionUrl = data.subscriptionUrl || "";

  if (normalized.style === "minimal") {
    return <MinimalGuide groups={groups} title={title} />;
  }

  if (
    normalized.style === "cards" ||
    normalized.style === "accordion" ||
    normalized.style === "timeline"
  ) {
    return (
      <GroupedGuide
        style={normalized.style}
        groups={groups}
        title={title}
        subscriptionUrl={subscriptionUrl}
        showDeeplinks={showDeeplinks}
        interactive={interactive}
        t={t}
      />
    );
  }

  // stepper (default)
  return (
    <StepperGuide
      groups={groups}
      title={title}
      subscriptionUrl={subscriptionUrl}
      showDeeplinks={showDeeplinks}
      interactive={interactive}
      t={t}
    />
  );
}
