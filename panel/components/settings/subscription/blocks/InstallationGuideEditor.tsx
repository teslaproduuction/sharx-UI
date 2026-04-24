"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, IconButton, Input, Segmented, Switch } from "@/components/ui";
import {
  APP_CATALOG,
  defaultAppsForPlatform,
  defaultInstallationGroups,
  installationStyles,
  normalizeInstallationGuideBlock,
  subscriptionApps,
  supportedPlatforms,
  type BlockInstallationGuide,
  type InstallationAppEntry,
  type InstallationPlatform,
  type InstallationStep,
  type InstallationStyle,
  type SubscriptionApp,
  type SupportedPlatform,
} from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockInstallationGuide;
  onChange: (next: BlockInstallationGuide) => void;
};

const PLATFORM_DEFAULT: Record<SupportedPlatform, string> = {
  ios: "iOS",
  android: "Android",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  androidtv: "Android TV",
};

function platformLabel(t: TFn, p: SupportedPlatform) {
  return t(`subBuilder.platform.${p}`, { defaultValue: PLATFORM_DEFAULT[p] });
}

type TFn = ReturnType<typeof useTranslation>["t"];

function styleLabel(t: TFn, s: InstallationStyle) {
  switch (s) {
    case "stepper":
      return t("subBuilder.install.stepper", { defaultValue: "Stepper" });
    case "timeline":
      return t("subBuilder.install.timeline", { defaultValue: "Timeline" });
    case "cards":
      return t("subBuilder.install.cards", { defaultValue: "Cards" });
    case "accordion":
      return t("subBuilder.install.accordion", { defaultValue: "Accordion" });
    case "minimal":
      return t("subBuilder.install.minimal", { defaultValue: "Minimal" });
  }
}

export function InstallationGuideEditor({ block, onChange }: Props) {
  const { t } = useTranslation();

  // Surface `groups` as the source of truth; migrate legacy `platforms[]` into groups
  // the first time the admin touches the block.
  const normalized = normalizeInstallationGuideBlock(block);
  const groups: InstallationPlatform[] = normalized.groups ?? [];

  const setGroups = (next: InstallationPlatform[]) => {
    const { platforms: _legacy, ...rest } = block;
    void _legacy;
    // Keep `platforms` synced to the list of enabled group keys for back-compat
    // with any consumer that still reads the flat field.
    onChange({
      ...rest,
      groups: next,
      platforms: next.filter((g) => g.enabled !== false).map((g) => g.platform),
    });
  };

  const updateGroup = (idx: number, patch: Partial<InstallationPlatform>) => {
    const next = groups.slice();
    next[idx] = { ...next[idx]!, ...patch };
    setGroups(next);
  };

  const removeGroup = (idx: number) => setGroups(groups.filter((_, i) => i !== idx));
  const moveGroup = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= groups.length) return;
    const next = groups.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setGroups(next);
  };

  const [newPlatform, setNewPlatform] = useState<SupportedPlatform>(() => {
    const used = new Set(groups.map((g) => g.platform));
    return (supportedPlatforms.find((p) => !used.has(p)) ?? "ios") as SupportedPlatform;
  });
  const usedPlatforms = new Set(groups.map((g) => g.platform));
  const availablePlatforms = supportedPlatforms.filter((p) => !usedPlatforms.has(p));

  const addPlatform = () => {
    if (usedPlatforms.has(newPlatform)) return;
    const group: InstallationPlatform = {
      platform: newPlatform,
      enabled: true,
      intro: "",
      apps: defaultAppsForPlatform(newPlatform),
    };
    setGroups([...groups, group]);
    const nextAvailable = supportedPlatforms.find(
      (p) => !usedPlatforms.has(p) && p !== newPlatform,
    );
    if (nextAvailable) setNewPlatform(nextAvailable as SupportedPlatform);
  };

  const resetToDefault = () => setGroups(defaultInstallationGroups());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.block.titleOverride", { defaultValue: "Title (optional)" })}
        </label>
        <Input
          value={block.title ?? ""}
          placeholder={t("pages.publicSub.installation", {
            defaultValue: "Installation guide",
          })}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.install.style", { defaultValue: "Layout" })}
        </div>
        <Segmented<InstallationStyle>
          items={installationStyles.map((s) => ({ id: s, label: styleLabel(t, s) }))}
          value={normalized.style}
          onChange={(style) => onChange({ ...block, style })}
          size="sm"
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
        <span className="min-w-0">
          <span className="block text-sm font-medium">
            {t("subBuilder.install.showDeeplinks", {
              defaultValue: "Show \"Add subscription\" buttons",
            })}
          </span>
          <span className="block text-[11px] text-[var(--fg-subtle)]">
            {t("subBuilder.install.showDeeplinksDesc", {
              defaultValue: "Renders a per-app deep-link button that imports the subscription directly.",
            })}
          </span>
        </span>
        <Switch
          checked={normalized.showDeeplinks !== false}
          onChange={(showDeeplinks) => onChange({ ...block, showDeeplinks })}
        />
      </label>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            {t("subBuilder.install.groups", { defaultValue: "Platforms" })}
          </div>
          {groups.length === 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !px-3 !text-xs"
              onClick={resetToDefault}
            >
              {t("subBuilder.install.resetDefaults", {
                defaultValue: "Reset to recommended",
              })}
            </Button>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {groups.map((group, idx) => (
            <PlatformGroupCard
              key={group.platform}
              group={group}
              onChange={(patch) => updateGroup(idx, patch)}
              onRemove={() => removeGroup(idx)}
              onMoveUp={idx > 0 ? () => moveGroup(idx, -1) : undefined}
              onMoveDown={idx < groups.length - 1 ? () => moveGroup(idx, 1) : undefined}
            />
          ))}
        </ul>

        {availablePlatforms.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs font-medium text-[var(--fg-muted)]">
              {t("subBuilder.install.addPlatform", { defaultValue: "Add platform" })}
            </div>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as SupportedPlatform)}
              className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm text-[var(--fg)] outline-none focus:border-[var(--accent)]"
            >
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>
                  {platformLabel(t, p)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !px-3 !text-xs"
              onClick={addPlatform}
            >
              <Plus size={14} />
              {t("add", { defaultValue: "Add" })}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Platform group card
// ---------------------------------------------------------------------------

function PlatformGroupCard({
  group,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  group: InstallationPlatform;
  onChange: (patch: Partial<InstallationPlatform>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const setApps = (apps: InstallationAppEntry[]) => onChange({ apps });
  const addApp = (app: SubscriptionApp) => {
    if (group.apps.some((e) => e.app === app)) return;
    setApps([...group.apps, { app, label: "", downloadUrl: "", steps: [] }]);
  };
  const removeAppAt = (i: number) => setApps(group.apps.filter((_, j) => j !== i));
  const moveApp = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= group.apps.length) return;
    const next = group.apps.slice();
    [next[i], next[j]] = [next[j]!, next[i]!];
    setApps(next);
  };
  const updateApp = (i: number, patch: Partial<InstallationAppEntry>) => {
    const next = group.apps.slice();
    next[i] = { ...next[i]!, ...patch };
    setApps(next);
  };

  const usedApps = new Set(group.apps.map((e) => e.app));
  const platformApps = subscriptionApps.filter((app) => {
    if (app === "custom") return false;
    if (usedApps.has(app)) return false;
    return APP_CATALOG[app]?.platforms.includes(group.platform);
  });
  const [newApp, setNewApp] = useState<SubscriptionApp>(
    (platformApps[0] ?? "custom") as SubscriptionApp,
  );

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-2 p-3">
        <div className="flex flex-col">
          <IconButton
            label={t("moveUp", { defaultValue: "Move up" })}
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="!h-6 !w-6 disabled:opacity-30"
          >
            <ArrowUp size={12} />
          </IconButton>
          <IconButton
            label={t("moveDown", { defaultValue: "Move down" })}
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="!h-6 !w-6 disabled:opacity-30"
          >
            <ArrowDown size={12} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--fg)]">
            {platformLabel(t, group.platform)}
          </div>
          <div className="text-[11px] text-[var(--fg-subtle)]">
            {group.apps.length}{" "}
            {t("subBuilder.install.appsWord", { defaultValue: "app(s)" })}
          </div>
        </div>
        <Switch
          checked={group.enabled !== false}
          onChange={(enabled) => onChange({ enabled })}
        />
        <IconButton
          label={expanded ? t("collapse", { defaultValue: "Collapse" }) : t("expand", { defaultValue: "Expand" })}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </IconButton>
        <IconButton
          label={t("delete", { defaultValue: "Delete" })}
          onClick={onRemove}
          className="hover:!bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] hover:!text-[var(--danger)]"
        >
          <Trash2 size={14} />
        </IconButton>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t border-[var(--border)] px-3 pb-3 pt-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.install.intro", { defaultValue: "Platform intro (optional)" })}
            </span>
            <Input
              value={group.intro ?? ""}
              placeholder={t("subBuilder.install.introPlaceholder", {
                defaultValue: "e.g. Install from the App Store, paste the subscription link, connect.",
              })}
              onChange={(e) => onChange({ intro: e.target.value })}
            />
          </label>

          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.install.apps", { defaultValue: "Recommended apps" })}
            </div>
            <ul className="flex flex-col gap-2">
              {group.apps.map((entry, i) => (
                <AppEntryCard
                  key={`${entry.app}-${i}`}
                  entry={entry}
                  onChange={(patch) => updateApp(i, patch)}
                  onRemove={() => removeAppAt(i)}
                  onMoveUp={i > 0 ? () => moveApp(i, -1) : undefined}
                  onMoveDown={i < group.apps.length - 1 ? () => moveApp(i, 1) : undefined}
                />
              ))}
            </ul>

            {platformApps.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-2.5">
                <div className="text-[11px] font-medium text-[var(--fg-muted)]">
                  {t("subBuilder.install.addApp", { defaultValue: "Add app" })}
                </div>
                <select
                  value={newApp}
                  onChange={(e) => setNewApp(e.target.value as SubscriptionApp)}
                  className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--fg)] outline-none focus:border-[var(--accent)]"
                >
                  {platformApps.map((app) => (
                    <option key={app} value={app}>
                      {APP_CATALOG[app]?.label ?? app}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !px-2.5 !text-[11px]"
                  onClick={() => addApp(newApp)}
                >
                  <Plus size={12} />
                  {t("add", { defaultValue: "Add" })}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// App entry card (per-app config inside a platform)
// ---------------------------------------------------------------------------

function AppEntryCard({
  entry,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  entry: InstallationAppEntry;
  onChange: (patch: Partial<InstallationAppEntry>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const catalog = APP_CATALOG[entry.app];
  const label = entry.label?.trim() || catalog?.label || entry.app;

  const setSteps = (steps: InstallationStep[]) => onChange({ steps });
  const addStep = () =>
    setSteps([...(entry.steps ?? []), { title: "", text: "" }]);
  const updateStep = (i: number, patch: Partial<InstallationStep>) => {
    const next = (entry.steps ?? []).slice();
    next[i] = { ...next[i]!, ...patch };
    setSteps(next);
  };
  const removeStep = (i: number) =>
    setSteps((entry.steps ?? []).filter((_, j) => j !== i));

  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 p-2">
        <div className="flex flex-col">
          <IconButton
            label={t("moveUp", { defaultValue: "Move up" })}
            onClick={onMoveUp}
            disabled={!onMoveUp}
            className="!h-5 !w-5 disabled:opacity-30"
          >
            <ArrowUp size={10} />
          </IconButton>
          <IconButton
            label={t("moveDown", { defaultValue: "Move down" })}
            onClick={onMoveDown}
            disabled={!onMoveDown}
            className="!h-5 !w-5 disabled:opacity-30"
          >
            <ArrowDown size={10} />
          </IconButton>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--fg)]">{label}</div>
          <div className="truncate text-[10px] text-[var(--fg-subtle)]">
            {entry.app}
            {entry.downloadUrl ? " · download" : ""}
            {entry.steps && entry.steps.length > 0 ? ` · ${entry.steps.length} steps` : ""}
          </div>
        </div>
        <IconButton
          label={expanded ? t("collapse", { defaultValue: "Collapse" }) : t("expand", { defaultValue: "Expand" })}
          onClick={() => setExpanded((v) => !v)}
          className="!h-7 !w-7"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </IconButton>
        <IconButton
          label={t("delete", { defaultValue: "Delete" })}
          onClick={onRemove}
          className="!h-7 !w-7 hover:!bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] hover:!text-[var(--danger)]"
        >
          <Trash2 size={12} />
        </IconButton>
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2.5 border-t border-[var(--border)] p-2.5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
                {t("subBuilder.install.label", { defaultValue: "Label" })}
              </span>
              <Input
                value={entry.label ?? ""}
                placeholder={catalog?.label ?? ""}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
                {t("subBuilder.install.downloadUrl", {
                  defaultValue: "Install / download URL",
                })}
              </span>
              <Input
                value={entry.downloadUrl ?? ""}
                placeholder="https://apps.apple.com/..."
                onChange={(e) => onChange({ downloadUrl: e.target.value })}
              />
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
                {t("subBuilder.install.steps", {
                  defaultValue: "Custom steps (optional, replaces the default)",
                })}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="!h-6 !px-2 !text-[10px]"
                onClick={addStep}
              >
                <Plus size={10} />
                {t("add", { defaultValue: "Add" })}
              </Button>
            </div>
            <ol className="flex flex-col gap-1.5">
              {(entry.steps ?? []).map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded border border-[var(--border)] bg-[var(--bg-elevated)] p-2"
                >
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[10px] font-semibold text-[var(--accent)]">
                    {i + 1}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Input
                      value={s.title ?? ""}
                      placeholder={t("subBuilder.install.stepTitle", {
                        defaultValue: "Step title",
                      })}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                    />
                    <Input
                      value={s.text ?? ""}
                      placeholder={t("subBuilder.install.stepText", {
                        defaultValue: "What the user needs to do",
                      })}
                      onChange={(e) => updateStep(i, { text: e.target.value })}
                    />
                  </div>
                  <IconButton
                    label={t("delete", { defaultValue: "Delete" })}
                    onClick={() => removeStep(i)}
                    className="!h-6 !w-6 hover:!bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] hover:!text-[var(--danger)]"
                  >
                    <Trash2 size={10} />
                  </IconButton>
                </li>
              ))}
              {(entry.steps ?? []).length === 0 ? (
                <li className="rounded border border-dashed border-[var(--border)] p-2 text-[11px] text-[var(--fg-subtle)]">
                  {t("subBuilder.install.noStepsHelp", {
                    defaultValue: "Leave empty to use the default Install → Import → Connect flow.",
                  })}
                </li>
              ) : null}
            </ol>
          </div>
        </div>
      ) : null}
    </li>
  );
}
