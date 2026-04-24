"use client";

import {
  Braces,
  Code2,
  Layers,
  Megaphone,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertBanner, Button, Input, Tabs, TabPanels, useToast } from "@/components/ui";
import { postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import {
  defaultV2,
  parseAnyAsV2,
  stringifyConfig,
  type SharxSubpageConfigV2,
  type SubpageBlock,
} from "@/lib/sharxSubpageConfig";
import { AppSettingsEditor } from "./AppSettingsEditor";
import { BlockListEditor } from "./BlockListEditor";
import { BrandingEditor } from "./BrandingEditor";
import { JsonTemplatesEditor } from "./JsonTemplatesEditor";
import { ResponseRulesEditor } from "./ResponseRulesEditor";
import { SubscriptionPreview } from "./SubscriptionPreview";

type LeftTab =
  | "branding"
  | "blocks"
  | "response-rules"
  | "app-settings"
  | "json-templates"
  | "raw";

export function SubscriptionBuilder() {
  const { t } = useTranslation();
  const toast = useToast();

  const [config, setConfig] = useState<SharxSubpageConfigV2>(() => defaultV2());
  const [uuid, setUuid] = useState("");
  const [name, setName] = useState("Default");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<LeftTab>("branding");
  const [rawJson, setRawJson] = useState("");
  const [rawError, setRawError] = useState<string | null>(null);
  const [migratedNotice, setMigratedNotice] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await postJson<{
      uuid: string;
      name: string;
      configJson: string;
    }>(panel("setting/subscriptionPageConfig/get"), { uuid: "" });
    setLoading(false);
    if (r.success && r.obj && typeof r.obj === "object") {
      const row = r.obj as { uuid?: string; name?: string; configJson?: string };
      setUuid(row.uuid ?? "");
      setName(row.name ?? "Default");
      const raw = row.configJson ?? "{}";
      const parsed = parseAnyAsV2(raw);
      if (parsed.ok) {
        setConfig(parsed.data);
        setMigratedNotice(!!parsed.migrated);
        setRawJson(stringifyConfig(parsed.data));
      } else {
        setRawJson(raw);
        toast.error(parsed.error);
      }
    } else {
      toast.error(r.msg || t("pages.settings.toasts.getSettings", { defaultValue: "Failed to load settings." }));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep raw JSON in sync when the user edits via visual builder.
  useEffect(() => {
    if (activeTab !== "raw") {
      setRawJson(stringifyConfig(config));
      setRawError(null);
    }
  }, [config, activeTab]);

  const handleSetBlocks = useCallback(
    (blocks: SubpageBlock[]) => setConfig((c) => ({ ...c, blocks })),
    [],
  );

  const handleRawChange = (raw: string) => {
    setRawJson(raw);
    const parsed = parseAnyAsV2(raw);
    if (!parsed.ok) {
      setRawError(parsed.error);
      return;
    }
    setRawError(null);
    setConfig(parsed.data);
  };

  const save = async () => {
    const payload = stringifyConfig(config);
    setLoading(true);
    const r = await postJson(
      panel("setting/subscriptionPageConfig/save"),
      {
        uuid: uuid || undefined,
        name,
        configJson: payload,
      },
      true,
    );
    setLoading(false);
    if (r.success) {
      toast.success(r.msg || t("subBuilder.saveSuccess", { defaultValue: "Saved" }));
      setMigratedNotice(false);
      void load();
    } else {
      toast.error(r.msg || t("pages.settings.toasts.modifySettings", { defaultValue: "Could not save." }));
    }
  };

  const resetToDefault = () => {
    const next = defaultV2();
    setConfig(next);
    setRawJson(stringifyConfig(next));
    setRawError(null);
  };

  const tabs = useMemo(
    () => [
      {
        id: "branding" as LeftTab,
        label: t("subBuilder.tabs.branding", { defaultValue: "Branding" }),
        icon: Palette,
      },
      {
        id: "blocks" as LeftTab,
        label: t("subBuilder.tabs.blocks", { defaultValue: "Blocks" }),
        icon: Layers,
        badge: config.blocks.length || undefined,
      },
      {
        id: "response-rules" as LeftTab,
        label: t("subBuilder.tabs.responseRules", { defaultValue: "Response rules" }),
        icon: Megaphone,
      },
      {
        id: "app-settings" as LeftTab,
        label: t("subBuilder.tabs.appSettings", { defaultValue: "App settings" }),
        icon: SlidersHorizontal,
      },
      {
        id: "json-templates" as LeftTab,
        label: t("subBuilder.tabs.jsonTemplates", { defaultValue: "JSON templates" }),
        icon: Braces,
      },
      {
        id: "raw" as LeftTab,
        label: t("subBuilder.tabs.raw", { defaultValue: "Raw JSON" }),
        icon: Code2,
      },
    ],
    [t, config.blocks.length],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
            {t("pages.settings.subpageConfigUuid", { defaultValue: "Config UUID" })}
          </div>
          <Input value={uuid} readOnly className="opacity-90" />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
            {t("pages.settings.subpageConfigName", { defaultValue: "Display name" })}
          </div>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>

      {migratedNotice ? (
        <AlertBanner
          type="info"
          title={t("subBuilder.migrated.title", {
            defaultValue: "Config was upgraded to sharx-v2",
          })}
          description={t("subBuilder.migrated.text", {
            defaultValue: "Your existing branding is preserved. Default blocks were added.",
          })}
          onClose={() => setMigratedNotice(false)}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <Tabs<LeftTab>
            tabs={tabs}
            active={activeTab}
            onChange={setActiveTab}
            layoutId="sub-builder-tab"
          />
          <TabPanels value={activeTab}>
            {activeTab === "branding" ? (
              <BrandingEditor config={config} onChange={setConfig} />
            ) : activeTab === "blocks" ? (
              <BlockListEditor blocks={config.blocks} onChange={handleSetBlocks} />
            ) : activeTab === "response-rules" ? (
              <ResponseRulesEditor config={config} onChange={setConfig} />
            ) : activeTab === "app-settings" ? (
              <AppSettingsEditor config={config} onChange={setConfig} />
            ) : activeTab === "json-templates" ? (
              <JsonTemplatesEditor config={config} onChange={setConfig} />
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={rawJson}
                  onChange={(e) => handleRawChange(e.target.value)}
                  spellCheck={false}
                  rows={18}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-xs text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                />
                {rawError ? (
                  <AlertBanner type="error" title={rawError} />
                ) : (
                  <p className="text-[11px] text-[var(--fg-subtle)]">
                    {t("subBuilder.raw.hint", {
                      defaultValue:
                        "Sharx-v1 and sharx-v2 are both accepted; v1 is migrated to v2 automatically.",
                    })}
                  </p>
                )}
              </div>
            )}
          </TabPanels>
        </div>

        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <SubscriptionPreview config={config} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-4">
        <Button type="button" variant="secondary" onClick={() => void load()} loading={loading}>
          <RefreshCw size={16} />
          {t("refresh", { defaultValue: "Refresh" })}
        </Button>
        <Button type="button" variant="secondary" onClick={resetToDefault}>
          <RotateCcw size={16} />
          {t("subBuilder.resetDefault", { defaultValue: "Reset to default" })}
        </Button>
        <div className="flex-1" />
        <Button
          type="button"
          variant="primary"
          onClick={() => void save()}
          loading={loading}
          disabled={!!rawError}
        >
          <Save size={16} />
          {t("pages.settings.subpageSaveConfig", {
            defaultValue: "Save subscription page config",
          })}
        </Button>
      </div>
    </div>
  );
}
