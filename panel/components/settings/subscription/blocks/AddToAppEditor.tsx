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
import { Button, IconButton, Input, SelectNative, Switch } from "@/components/ui";
import {
  APP_CATALOG,
  defaultAppButtons,
  genBlockId,
  subscriptionApps,
  supportedPlatforms,
  type AppButton,
  type BlockAddToApp,
  type SubscriptionApp,
  type SupportedPlatform,
} from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockAddToApp;
  onChange: (next: BlockAddToApp) => void;
};

const TEMPLATE_HELP =
  "{url} {urlEncoded} {b64Url} {urlJson} {urlJsonEncoded} {happEncrypted} {v2raytunEncrypted}";

export function AddToAppEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  const [newApp, setNewApp] = useState<SubscriptionApp>("happ");

  // Accept legacy blocks that only carried `apps[]`: migrate once on first edit.
  const buttons: AppButton[] =
    block.buttons && block.buttons.length > 0
      ? block.buttons
      : block.apps && block.apps.length > 0
        ? block.apps.map<AppButton>((app) => ({
            id: genBlockId(),
            app,
            enabled: true,
            label: "",
            iconUrl: "",
            platforms: APP_CATALOG[app]?.platforms ?? [],
            deepLinkTemplate: "",
            useEncrypted: APP_CATALOG[app]?.supportsEncrypted === true,
          }))
        : [];

  const setButtons = (next: AppButton[]) => {
    const { apps: _legacy, ...rest } = block;
    void _legacy;
    onChange({ ...rest, buttons: next });
  };

  const updateAt = (idx: number, patch: Partial<AppButton>) => {
    const next = buttons.slice();
    next[idx] = { ...next[idx]!, ...patch };
    setButtons(next);
  };

  const removeAt = (idx: number) => {
    setButtons(buttons.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx <= 0) return;
    const next = buttons.slice();
    [next[idx - 1], next[idx]] = [next[idx]!, next[idx - 1]!];
    setButtons(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= buttons.length - 1) return;
    const next = buttons.slice();
    [next[idx + 1], next[idx]] = [next[idx]!, next[idx + 1]!];
    setButtons(next);
  };

  const addButton = () => {
    const entry = APP_CATALOG[newApp];
    const button: AppButton = {
      id: genBlockId(),
      app: newApp,
      enabled: true,
      label: "",
      iconUrl: "",
      platforms: entry?.platforms ?? [],
      deepLinkTemplate: "",
      useEncrypted: entry?.supportsEncrypted === true,
    };
    setButtons([...buttons, button]);
  };

  const seedDefaults = () => setButtons(defaultAppButtons());

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.block.titleOverride", { defaultValue: "Title (optional)" })}
        </label>
        <Input
          value={block.title ?? ""}
          placeholder={t("pages.publicSub.addToApp", { defaultValue: "Add to app" })}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
        <span className="min-w-0 truncate">
          {t("subBuilder.addToApp.preferJsonUrl", {
            defaultValue: "Prefer JSON subscription URL when available",
          })}
        </span>
        <Switch
          checked={block.preferJsonUrl === true}
          onChange={(preferJsonUrl) => onChange({ ...block, preferJsonUrl })}
        />
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
            {t("subBuilder.addToApp.buttons", { defaultValue: "Buttons" })}
          </div>
          {buttons.length === 0 ? (
            <Button
              type="button"
              variant="secondary"
              className="!h-8 !px-3 !text-xs"
              onClick={seedDefaults}
            >
              {t("subBuilder.addToApp.seedDefaults", {
                defaultValue: "Seed with recommended apps",
              })}
            </Button>
          ) : null}
        </div>

        <ul className="flex flex-col gap-2">
          {buttons.map((button, idx) => (
            <ButtonCard
              key={button.id}
              button={button}
              onChange={(patch) => updateAt(idx, patch)}
              onRemove={() => removeAt(idx)}
              onMoveUp={idx > 0 ? () => moveUp(idx) : undefined}
              onMoveDown={idx < buttons.length - 1 ? () => moveDown(idx) : undefined}
            />
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="text-xs font-medium text-[var(--fg-muted)]">
            {t("subBuilder.addToApp.addButton", { defaultValue: "Add button for" })}
          </div>
          <SelectNative
            inputSize="sm"
            value={newApp}
            onChange={(e) => setNewApp(e.target.value as SubscriptionApp)}
            className="max-w-[14rem]"
          >
            {subscriptionApps.map((app) => (
              <option key={app} value={app}>
                {APP_CATALOG[app]?.label ?? app}
              </option>
            ))}
          </SelectNative>
          <Button
            type="button"
            variant="secondary"
            className="!h-8 !px-3 !text-xs"
            onClick={addButton}
          >
            <Plus size={14} />
            {t("add", { defaultValue: "Add" })}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--fg-subtle)]">
          {t("subBuilder.addToApp.templateVarsHelp", {
            defaultValue: "Template variables: ",
          })}
          <code className="ml-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg)]">
            {TEMPLATE_HELP}
          </code>
        </p>
      </div>
    </div>
  );
}

function ButtonCard({
  button,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  button: AppButton;
  onChange: (patch: Partial<AppButton>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const entry = APP_CATALOG[button.app];
  const displayLabel = button.label?.trim() || entry?.label || button.app;
  const defaultPlatforms = entry?.platforms ?? [];
  const templatePlaceholder = entry?.deepLinkTemplate ?? "";

  const platformsSelected = new Set<SupportedPlatform>(button.platforms ?? []);
  const togglePlatform = (p: SupportedPlatform) => {
    const next = new Set(platformsSelected);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange({ platforms: Array.from(next) });
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="flex items-center gap-2">
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
          <div className="truncate text-sm font-medium text-[var(--fg)]">
            {displayLabel}
          </div>
          <div className="truncate text-[11px] text-[var(--fg-subtle)]">
            {button.app}
            {button.useEncrypted && entry?.supportsEncrypted ? " · E2E" : ""}
          </div>
        </div>
        <Switch
          checked={button.enabled !== false}
          onChange={(enabled) => onChange({ enabled })}
          ariaLabel={t("enable", { defaultValue: "Enabled" })}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.addToApp.label", { defaultValue: "Label" })}
            </span>
            <Input
              value={button.label ?? ""}
              placeholder={entry?.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.addToApp.iconUrl", { defaultValue: "Icon URL (optional)" })}
            </span>
            <Input
              value={button.iconUrl ?? ""}
              placeholder="https://…/icon.svg"
              onChange={(e) => onChange({ iconUrl: e.target.value })}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.addToApp.template", { defaultValue: "Deep link template" })}
            </span>
            <Input
              value={button.deepLinkTemplate ?? ""}
              placeholder={templatePlaceholder}
              onChange={(e) => onChange({ deepLinkTemplate: e.target.value })}
            />
          </label>
          <div className="sm:col-span-2">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("subBuilder.addToApp.platforms", { defaultValue: "Platforms" })}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {supportedPlatforms.map((p) => {
                const active = platformsSelected.has(p);
                const isDefault = defaultPlatforms.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
                      active
                        ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--accent)]"
                    } ${isDefault && !active ? "opacity-70" : ""}`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
          {entry?.supportsEncrypted ? (
            <label className="sm:col-span-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--fg)]">
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {t("subBuilder.addToApp.useEncrypted", {
                    defaultValue: "Use encrypted deeplink (E2E)",
                  })}
                </span>
                <span className="block text-[11px] text-[var(--fg-subtle)]">
                  {t("subBuilder.addToApp.useEncryptedDesc", {
                    defaultValue:
                      "Generate happ://crypt4 / v2raytun://crypt via the server when available.",
                  })}
                </span>
              </span>
              <Switch
                checked={button.useEncrypted === true}
                onChange={(useEncrypted) => onChange({ useEncrypted })}
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
