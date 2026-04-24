"use client";

import {
  BarChart3,
  Bell,
  Building2,
  CalendarSync,
  Download,
  Gauge,
  KeyRound,
  Link2,
  ListOrdered,
  Palette,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Server,
  Settings as SettingsGearIcon,
  Shield,
  SlidersHorizontal,
  Tags,
  ToggleLeft,
  Type,
  UserCog,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AllSetting } from "@/lib/allSetting";
import { normalizeAllSetting } from "@/lib/allSetting";
import { postJson } from "@/lib/api";
import {
  buildRemarkModel,
  formatRemarkModelPreview,
  parseRemarkModelUi,
} from "@/lib/remarkModelUi";
import { panel, p } from "@/lib/paths";
import { parseSettingsTab, type SettingsTabId } from "@/lib/settingsTabs";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { SubscriptionBuilder } from "@/components/settings/subscription/SubscriptionBuilder";
import {
  AlertBanner,
  Button,
  CheckboxField,
  ConfirmDialog,
  IconTile,
  Input,
  SelectNative,
  Spinner,
  useToast,
  type IconTileTone,
} from "@/components/ui";

function SettingsSection({
  title,
  hint,
  children,
  icon,
  iconTone = "accent",
  full,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  icon?: LucideIcon;
  iconTone?: IconTileTone;
  full?: boolean;
}) {
  return (
    <Surface
      padding="none"
      className={`h-full overflow-hidden ${full ? "lg:col-span-2" : ""}`}
    >
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-start gap-3">
          {icon ? <IconTile icon={icon} tone={iconTone} size="sm" className="mt-0.5" /> : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-[var(--fg)]">{title}</h2>
            {hint ? <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">{hint}</p> : null}
          </div>
        </div>
      </div>
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </Surface>
  );
}

function SettingsGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">{children}</div>;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,280px)_1fr] sm:items-start">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--fg-muted)]">{label}</div>
        {hint ? <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{hint}</div> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

type SettingsTabConfig = {
  id: SettingsTabId;
  label: string;
  icon: LucideIcon;
};

export function SettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const params = useParams();
  const activeTab = parseSettingsTab(
    typeof params?.tab === "string" ? params.tab : undefined,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AllSetting | null>(null);
  const [baseline, setBaseline] = useState<AllSetting | null>(null);
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartLoading, setRestartLoading] = useState(false);
  const [multiConfirmOpen, setMultiConfirmOpen] = useState(false);
  const [account, setAccount] = useState({
    oldUsername: "",
    oldPassword: "",
    newUsername: "",
    newPassword: "",
  });
  const load = useCallback(async () => {
    setLoading(true);
    const r = await postJson<Record<string, unknown>>(panel("setting/all"));
    setLoading(false);
    if (r.success && r.obj && typeof r.obj === "object" && !Array.isArray(r.obj)) {
      const n = normalizeAllSetting(r.obj as Record<string, unknown>);
      setForm(n);
      setBaseline(n);
    } else {
      toast.error(r.msg || t("pages.settings.toasts.getSettings"));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  const remarkModelUi = useMemo(
    () => parseRemarkModelUi(form?.remarkModel ?? ""),
    [form?.remarkModel],
  );
  const remarkModelPreview = useMemo(
    () => formatRemarkModelPreview(form?.remarkModel ?? "-ieo"),
    [form?.remarkModel],
  );

  const patch = useCallback(<K extends keyof AllSetting>(key: K, value: AllSetting[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    const r = await postJson(panel("setting/update"), form, true);
    setSaving(false);
    if (r.success) {
      toast.success(r.msg || t("success"));
      await load();
    } else {
      toast.error(r.msg || t("pages.settings.toasts.modifySettings"));
    }
  };

  const revert = () => {
    if (baseline) setForm(baseline);
  };

  const saveAccount = async () => {
    const r = await postJson(
      panel("setting/updateUser"),
      {
        oldUsername: account.oldUsername,
        oldPassword: account.oldPassword,
        newUsername: account.newUsername,
        newPassword: account.newPassword,
      },
      true,
    );
    if (r.success) {
      toast.success(r.msg || t("pages.settings.toasts.modifyUser"));
      setAccount({ oldUsername: "", oldPassword: "", newUsername: "", newPassword: "" });
    } else {
      toast.error(r.msg || t("pages.settings.toasts.modifyUserError"));
    }
  };

  const doRestart = async () => {
    setRestartLoading(true);
    const r = await postJson(panel("setting/restartPanel"));
    setRestartLoading(false);
    setRestartOpen(false);
    if (r.success) {
      toast.success(r.msg || t("pages.settings.restartPanelSuccess"));
    } else {
      toast.error(r.msg || t("fail"));
    }
  };

  const downloadGrafana = () => {
    window.location.href = p("panel/setting/grafana/dashboard");
  };

  const settingsTabs: SettingsTabConfig[] = useMemo(
    () => [
      { id: "general", label: t("pages.settings.tabs.general"), icon: SlidersHorizontal },
      { id: "security", label: t("pages.settings.tabs.security"), icon: Shield },
      { id: "telegram", label: t("pages.settings.tabs.telegram"), icon: Send },
      { id: "subscription", label: t("pages.settings.tabs.subscription"), icon: Link2 },
      { id: "ldap", label: t("pages.settings.tabs.ldap"), icon: Building2 },
      { id: "grafana", label: t("pages.settings.tabs.grafana"), icon: BarChart3 },
      { id: "admin", label: t("pages.settings.tabs.admin"), icon: UserCog },
    ],
    [t],
  );

  const activeTabLabel = useMemo(
    () => settingsTabs.find((x) => x.id === activeTab)?.label,
    [settingsTabs, activeTab],
  );

  if (loading && !form) {
    return (
      <PageScaffold>
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner size={40} />
        </div>
      </PageScaffold>
    );
  }

  if (!form) {
    return (
      <PageScaffold compact>
        <PageHeader title={t("menu.settings")} icon={SettingsGearIcon} iconTone="neutral" />
        <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
      </PageScaffold>
    );
  }

  const envHint = t("pages.settings.envOnlyHint", {
    defaultValue:
      "Effective values for these options are usually set via environment variables; shown values are what the API reports.",
  });

  const tabNav = (
    <nav
      className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--border)] pb-px [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label={t("menu.settings")}
    >
      {settingsTabs.map((tab) => {
        const on = activeTab === tab.id;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={p(`panel/settings/${tab.id}`)}
            scroll={false}
            role="tab"
            aria-selected={on}
            id={`settings-tab-${tab.id}`}
            aria-controls={`settings-panel-${tab.id}`}
            className={`flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              on
                ? "rounded-t-lg bg-[var(--surface-strong)] text-[var(--fg)] ring-1 ring-[var(--border-strong)] ring-b-0"
                : "whitespace-nowrap rounded-t-lg text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_6%,transparent)] hover:text-[var(--fg)]"
            }`}
          >
            <Icon className="size-4 shrink-0 opacity-90" aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );

  const panelBody = (
    <>
      {activeTab === "general" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.generalPanelBind")}
            hint={envHint}
            icon={Server}
            iconTone="info"
          >
            <Row label={t("pages.settings.panelListeningIP")} hint={t("pages.settings.panelListeningIPDesc")}>
              <Input value={form.webListen} readOnly className="opacity-80" />
            </Row>
            <Row label={t("pages.settings.panelListeningDomain")} hint={t("pages.settings.panelListeningDomainDesc")}>
              <Input value={form.webDomain} readOnly className="opacity-80" />
            </Row>
            <Row label={t("pages.settings.panelPort")} hint={t("pages.settings.panelPortDesc")}>
              <Input type="number" value={form.webPort} readOnly className="opacity-80" />
            </Row>
            <Row label={t("pages.settings.publicKeyPath")} hint={t("pages.settings.publicKeyPathDesc")}>
              <Input value={form.webCertFile} readOnly className="opacity-80" />
            </Row>
            <Row label={t("pages.settings.privateKeyPath")} hint={t("pages.settings.privateKeyPathDesc")}>
              <Input value={form.webKeyFile} readOnly className="opacity-80" />
            </Row>
            <Row label={t("pages.settings.panelUrlPath")} hint={t("pages.settings.panelUrlPathDesc")}>
              <Input value={form.webBasePath} readOnly className="opacity-80" />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.generalSessionLists")}
            icon={ListOrdered}
            iconTone="accent"
          >
            <Row label={t("pages.settings.sessionMaxAge")} hint={t("pages.settings.sessionMaxAgeDesc")}>
              <Input
                type="number"
                value={form.sessionMaxAge}
                onChange={(e) => patch("sessionMaxAge", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.pageSize")} hint={t("pages.settings.pageSizeDesc")}>
              <Input
                type="number"
                value={form.pageSize}
                onChange={(e) => patch("pageSize", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.generalThresholdsDisplay")}
            icon={Gauge}
            iconTone="warning"
          >
            <Row label={t("pages.settings.expireTimeDiff")} hint={t("pages.settings.expireTimeDiffDesc")}>
              <Input
                type="number"
                value={form.expireDiff}
                onChange={(e) => patch("expireDiff", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.trafficDiff")} hint={t("pages.settings.trafficDiffDesc")}>
              <Input
                type="number"
                value={form.trafficDiff}
                onChange={(e) => patch("trafficDiff", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row
              label={t("pages.settings.remarkModel")}
              hint={t("pages.settings.remarkModelDesc")}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="w-full sm:max-w-[6rem]">
                    <label
                      className="mb-1.5 block text-xs font-medium text-[var(--fg-subtle)]"
                      htmlFor="set-remark-sep"
                    >
                      {t("pages.settings.remarkModelSep")}
                    </label>
                    <Input
                      id="set-remark-sep"
                      className="font-mono"
                      value={remarkModelUi.sep}
                      onChange={(e) => {
                        const first =
                          Array.from(e.target.value || "-")[0] ?? "-";
                        patch(
                          "remarkModel",
                          buildRemarkModel(first, remarkModelUi.order),
                        );
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <label
                      className="mb-1.5 block text-xs font-medium text-[var(--fg-subtle)]"
                      htmlFor="set-remark-order"
                    >
                      {t("pages.settings.remarkModelOrder")}
                    </label>
                    <Input
                      id="set-remark-order"
                      className="font-mono"
                      value={remarkModelUi.order}
                      onChange={(e) =>
                        patch(
                          "remarkModel",
                          buildRemarkModel(remarkModelUi.sep, e.target.value),
                        )
                      }
                      placeholder="ieo"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
                  {t("pages.settings.remarkModelOrderHint")}
                </p>
                <p className="text-xs text-[var(--fg-muted)]">
                  <span className="text-[var(--fg-subtle)]">
                    {t("pages.settings.sampleRemark")}:
                  </span>{" "}
                  <span className="font-mono text-[var(--fg)]">
                    {remarkModelPreview}
                  </span>
                </p>
              </div>
            </Row>
            <Row label={t("pages.settings.datepicker")} hint={t("pages.settings.datepickerDescription")}>
              <Input
                value={form.datepicker}
                onChange={(e) => patch("datepicker", e.target.value)}
                placeholder={t("pages.settings.datepickerPlaceholder")}
              />
            </Row>
            <Row label={t("pages.settings.timeZone")} hint={t("pages.settings.timeZoneDesc")}>
              <Input value={form.timeLocation} onChange={(e) => patch("timeLocation", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.generalModes")}
            icon={ToggleLeft}
            iconTone="success"
          >
            <Row
              label={t("pages.settings.panelLogLevel", { defaultValue: "Panel log level" })}
              hint={t("pages.settings.panelLogLevelDesc", {
                defaultValue: "Log verbosity for the panel process (when Grafana Loki is disabled).",
              })}
            >
              <SelectNative value={form.panelLogLevel} onChange={(e) => patch("panelLogLevel", e.target.value)}>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="notice">notice</option>
                <option value="warning">warning</option>
                <option value="error">error</option>
              </SelectNative>
            </Row>
            <Row label={t("pages.settings.multiNodeMode")} hint={t("pages.settings.multiNodeModeDesc")}>
              <CheckboxField
                label={t("pages.settings.enableMultiNodeMode", { defaultValue: "Enable multi-node mode" })}
                checked={form.multiNodeMode}
                onChange={(e) => {
                  const on = e.target.checked;
                  if (on && !form.multiNodeMode) {
                    setMultiConfirmOpen(true);
                  } else {
                    patch("multiNodeMode", on);
                  }
                }}
              />
            </Row>
            <Row label={t("hwidSettings")} hint={t("hwidBetaWarningDesc")}>
              <SelectNative value={form.hwidMode} onChange={(e) => patch("hwidMode", e.target.value)}>
                <option value="off">{t("pages.settings.hwidMode.off", { defaultValue: "Off" })}</option>
                <option value="client_header">
                  {t("pages.settings.hwidMode.header", { defaultValue: "Client header (x-hwid)" })}
                </option>
                <option value="legacy_fingerprint">
                  {t("pages.settings.hwidMode.legacy", { defaultValue: "Legacy fingerprint (deprecated)" })}
                </option>
              </SelectNative>
            </Row>
          </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "security" ? (
        <SettingsGrid>
        <SettingsSection
          title={t("pages.settings.security.twoFactorSection")}
          icon={Shield}
          iconTone="danger"
          full
        >
          <Row label={t("pages.settings.security.twoFactorEnable")} hint={t("pages.settings.security.twoFactorEnableDesc")}>
            <CheckboxField
              label={t("enable")}
              checked={form.twoFactorEnable}
              onChange={(e) => patch("twoFactorEnable", e.target.checked)}
            />
          </Row>
          <Row label={t("pages.settings.security.twoFactor")}>
            <Input
              value={form.twoFactorToken}
              onChange={(e) => patch("twoFactorToken", e.target.value)}
              autoComplete="off"
            />
          </Row>
        </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "telegram" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.telegramConnection")}
            icon={Send}
            iconTone="info"
          >
            <Row label={t("pages.settings.telegramBotEnable")} hint={t("pages.settings.telegramBotEnableDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.tgBotEnable}
                onChange={(e) => patch("tgBotEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.telegramToken")} hint={t("pages.settings.telegramTokenDesc")}>
              <Input value={form.tgBotToken} onChange={(e) => patch("tgBotToken", e.target.value)} autoComplete="off" />
            </Row>
            <Row label={t("pages.settings.telegramProxy")} hint={t("pages.settings.telegramProxyDesc")}>
              <Input value={form.tgBotProxy} onChange={(e) => patch("tgBotProxy", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.telegramAPIServer")} hint={t("pages.settings.telegramAPIServerDesc")}>
              <Input value={form.tgBotAPIServer} onChange={(e) => patch("tgBotAPIServer", e.target.value)} />
            </Row>
          </SettingsSection>
          <SettingsSection
            title={t("pages.settings.sections.telegramNotifications")}
            icon={Bell}
            iconTone="warning"
          >
            <Row label={t("pages.settings.telegramChatId")} hint={t("pages.settings.telegramChatIdDesc")}>
              <Input value={form.tgBotChatId} onChange={(e) => patch("tgBotChatId", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.telegramNotifyTime")} hint={t("pages.settings.telegramNotifyTimeDesc")}>
              <Input value={form.tgRunTime} onChange={(e) => patch("tgRunTime", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.tgNotifyBackup")} hint={t("pages.settings.tgNotifyBackupDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.tgBotBackup}
                onChange={(e) => patch("tgBotBackup", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.tgNotifyLogin")} hint={t("pages.settings.tgNotifyLoginDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.tgBotLoginNotify}
                onChange={(e) => patch("tgBotLoginNotify", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.tgNotifyCpu")} hint={t("pages.settings.tgNotifyCpuDesc")}>
              <Input
                type="number"
                value={form.tgCpu}
                onChange={(e) => patch("tgCpu", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.telegramBotLanguage")}>
              <Input value={form.tgLang} onChange={(e) => patch("tgLang", e.target.value)} />
            </Row>
          </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "subscription" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.subOverview")}
            hint={envHint}
            icon={Link2}
            iconTone="accent"
          >
            <Row label={t("pages.settings.subEnable")} hint={t("pages.settings.subEnableDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.subEnable}
                onChange={(e) => patch("subEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.subJsonEnable")}>
              <CheckboxField
                label={t("enable")}
                checked={form.subJsonEnable}
                onChange={(e) => patch("subJsonEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.subListen")} hint={t("pages.settings.subListenDesc")}>
              <Input value={form.subListen} onChange={(e) => patch("subListen", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.subUriTitles", { defaultValue: "Public URLs" })}
            icon={Type}
            iconTone="neutral"
          >
            <div className="px-4 pt-3">
              <AlertBanner
                type="info"
                title={t("pages.settings.envOnlyNetworkTitle", {
                  defaultValue: "Network is configured via environment variables",
                })}
                description={t("pages.settings.envOnlyNetworkDesc", {
                  defaultValue:
                    "Port, path, domain and TLS cert/key for the subscription endpoint are read from XUI_SUB_PORT / XUI_SUB_PATH / XUI_SUB_DOMAIN / XUI_SUB_CERT_FILE / XUI_SUB_KEY_FILE. Edit .env and restart the panel.",
                })}
              />
            </div>
            <Row label={t("pages.settings.subURI")} hint={t("pages.settings.subURIDesc")}>
              <Input value={form.subURI} onChange={(e) => patch("subURI", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.subJsonPath", { defaultValue: "JSON sub path" })}>
              <Input value={form.subJsonPath} onChange={(e) => patch("subJsonPath", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.subJsonURI", { defaultValue: "JSON subscription URI" })}>
              <Input value={form.subJsonURI} onChange={(e) => patch("subJsonURI", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.subExternalTraffic")}
            icon={Webhook}
            iconTone="warning"
          >
            <Row label={t("pages.settings.externalTrafficInformEnable")} hint={t("pages.settings.externalTrafficInformEnableDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.externalTrafficInformEnable}
                onChange={(e) => patch("externalTrafficInformEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.externalTrafficInformURI")} hint={t("pages.settings.externalTrafficInformURIDesc")}>
              <Input value={form.externalTrafficInformURI} onChange={(e) => patch("externalTrafficInformURI", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.subProvider")}
            icon={Tags}
            iconTone="accent"
          >
            <Row label={t("pages.settings.subProviderID")} hint={t("pages.settings.subProviderIDDesc")}>
              <Input value={form.subProviderID} onChange={(e) => patch("subProviderID", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.subProviderIDMethod")} hint={t("pages.settings.subProviderIDMethodDesc")}>
              <SelectNative
                value={form.subProviderIDMethod}
                onChange={(e) => patch("subProviderIDMethod", e.target.value)}
              >
                <option value="url">{t("pages.settings.subProviderIDMethodUrl")}</option>
                <option value="header">{t("pages.settings.subProviderIDMethodHeader")}</option>
                <option value="body">{t("pages.settings.subProviderIDMethodBody")}</option>
                <option value="none">{t("pages.settings.subProviderIDMethodNone")}</option>
              </SelectNative>
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.subpageBuilder", {
              defaultValue: "Public subscription page (SharX)",
            })}
            hint={t("pages.settings.sections.subpageBuilderHint", {
              defaultValue:
                "Branding, blocks, response headers, app settings and JSON templates — all in one live-preview builder for /panel/sub/?id=…",
            })}
            icon={Palette}
            iconTone="accent"
            full
          >
            <div className="px-4 py-4">
              <SubscriptionBuilder />
            </div>
          </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "ldap" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.ldapServerTls")}
            hint={t("pages.settings.ldapSectionDesc", {
              defaultValue: "Directory sync and authentication (optional).",
            })}
            icon={Building2}
            iconTone="info"
          >
            <Row label={t("pages.settings.ldapEnable", { defaultValue: "Enable LDAP" })}>
              <CheckboxField
                label={t("enable")}
                checked={form.ldapEnable}
                onChange={(e) => patch("ldapEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("host")}>
              <Input value={form.ldapHost} onChange={(e) => patch("ldapHost", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapPortLabel", { defaultValue: "LDAP port" })}>
              <Input
                type="number"
                value={form.ldapPort}
                onChange={(e) => patch("ldapPort", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.certs", { defaultValue: "TLS" })}>
              <CheckboxField
                label={t("pages.settings.ldapUseTLS", { defaultValue: "Use TLS" })}
                checked={form.ldapUseTLS}
                onChange={(e) => patch("ldapUseTLS", e.target.checked)}
              />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.ldapBindSearch")}
            icon={KeyRound}
            iconTone="neutral"
          >
            <Row label="Bind DN">
              <Input value={form.ldapBindDN} onChange={(e) => patch("ldapBindDN", e.target.value)} autoComplete="off" />
            </Row>
            <Row label={t("password")}>
              <Input
                type="password"
                value={form.ldapPassword}
                onChange={(e) => patch("ldapPassword", e.target.value)}
                autoComplete="new-password"
              />
            </Row>
            <Row label="Base DN">
              <Input value={form.ldapBaseDN} onChange={(e) => patch("ldapBaseDN", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapUserFilter", { defaultValue: "User filter" })}>
              <Input value={form.ldapUserFilter} onChange={(e) => patch("ldapUserFilter", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapUserAttr", { defaultValue: "User attribute" })}>
              <Input value={form.ldapUserAttr} onChange={(e) => patch("ldapUserAttr", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapVlessField", { defaultValue: "VLESS flag field" })}>
              <Input value={form.ldapVlessField} onChange={(e) => patch("ldapVlessField", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.ldapSyncFlags")}
            icon={CalendarSync}
            iconTone="accent"
          >
            <Row label={t("pages.settings.ldapSyncCron", { defaultValue: "Sync schedule (cron)" })}>
              <Input value={form.ldapSyncCron} onChange={(e) => patch("ldapSyncCron", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapFlagField", { defaultValue: "Flag field" })}>
              <Input value={form.ldapFlagField} onChange={(e) => patch("ldapFlagField", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapTruthyValues", { defaultValue: "Truthy values" })}>
              <Input value={form.ldapTruthyValues} onChange={(e) => patch("ldapTruthyValues", e.target.value)} />
            </Row>
            <Row label={t("pages.settings.ldapInvertFlag", { defaultValue: "Invert flag" })}>
              <CheckboxField
                label={t("enable")}
                checked={form.ldapInvertFlag}
                onChange={(e) => patch("ldapInvertFlag", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.ldapInboundTags", { defaultValue: "Inbound tags" })}>
              <Input value={form.ldapInboundTags} onChange={(e) => patch("ldapInboundTags", e.target.value)} />
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.ldapClientDefaults")}
            icon={UserCog}
            iconTone="success"
          >
            <Row label={t("pages.settings.ldapAutoCreate", { defaultValue: "Auto-create clients" })}>
              <CheckboxField
                label={t("enable")}
                checked={form.ldapAutoCreate}
                onChange={(e) => patch("ldapAutoCreate", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.ldapAutoDelete", { defaultValue: "Auto-delete clients" })}>
              <CheckboxField
                label={t("enable")}
                checked={form.ldapAutoDelete}
                onChange={(e) => patch("ldapAutoDelete", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.ldapDefaultTotalGB", { defaultValue: "Default traffic (GB)" })}>
              <Input
                type="number"
                value={form.ldapDefaultTotalGB}
                onChange={(e) => patch("ldapDefaultTotalGB", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.ldapDefaultExpiryDays", { defaultValue: "Default expiry (days)" })}>
              <Input
                type="number"
                value={form.ldapDefaultExpiryDays}
                onChange={(e) => patch("ldapDefaultExpiryDays", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
            <Row label={t("pages.settings.ldapDefaultLimitIP", { defaultValue: "Default IP limit" })}>
              <Input
                type="number"
                value={form.ldapDefaultLimitIP}
                onChange={(e) => patch("ldapDefaultLimitIP", parseInt(e.target.value, 10) || 0)}
              />
            </Row>
          </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "grafana" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.grafanaEndpoints")}
            hint={t("pages.settings.grafanaIntegrationEnabledDesc")}
            icon={BarChart3}
            iconTone="info"
          >
            <Row label={t("pages.settings.grafanaEnable")} hint={t("pages.settings.grafanaEnableDesc")}>
              <CheckboxField
                label={t("enable")}
                checked={form.grafanaEnable}
                onChange={(e) => patch("grafanaEnable", e.target.checked)}
              />
            </Row>
            <Row label={t("pages.settings.grafanaLokiUrl")} hint={t("pages.settings.grafanaLokiUrlDesc")}>
              <Input value={form.grafanaLokiUrl} onChange={(e) => patch("grafanaLokiUrl", e.target.value)} />
            </Row>
            <Row
              label={t("pages.settings.grafanaVictoriaMetricsUrl", { defaultValue: "VictoriaMetrics URL" })}
              hint={t("pages.settings.grafanaVictoriaMetricsUrlDesc", {
                defaultValue: "Remote write / import endpoint for metrics.",
              })}
            >
              <Input
                value={form.grafanaVictoriaMetricsUrl}
                onChange={(e) => patch("grafanaVictoriaMetricsUrl", e.target.value)}
              />
            </Row>
          </SettingsSection>
          <SettingsSection
            title={t("pages.settings.sections.grafanaExport")}
            icon={Download}
            iconTone="success"
          >
            <Row label={t("pages.settings.grafanaMetricsEndpoint")} hint={t("pages.settings.grafanaMetricsEndpointDesc")}>
              <code className="text-xs break-all text-[var(--fg-muted)]">{p("panel/metrics")}</code>
            </Row>
            <Row label={t("pages.settings.grafanaDashboard")} hint={t("pages.settings.grafanaDashboardDesc")}>
              <Button type="button" variant="secondary" className="!gap-2" onClick={downloadGrafana}>
                <Download size={16} />
                {t("download")}
              </Button>
            </Row>
          </SettingsSection>
        </SettingsGrid>
      ) : null}

      {activeTab === "admin" ? (
        <SettingsGrid>
          <SettingsSection
            title={t("pages.settings.sections.adminCredentials")}
            icon={UserCog}
            iconTone="danger"
          >
            <Row label={t("pages.settings.oldUsername")}>
              <Input
                value={account.oldUsername}
                onChange={(e) => setAccount((a) => ({ ...a, oldUsername: e.target.value }))}
                autoComplete="username"
              />
            </Row>
            <Row label={t("pages.settings.currentPassword")}>
              <Input
                type="password"
                value={account.oldPassword}
                onChange={(e) => setAccount((a) => ({ ...a, oldPassword: e.target.value }))}
                autoComplete="current-password"
              />
            </Row>
            <Row label={t("pages.settings.newUsername")}>
              <Input
                value={account.newUsername}
                onChange={(e) => setAccount((a) => ({ ...a, newUsername: e.target.value }))}
                autoComplete="off"
              />
            </Row>
            <Row label={t("pages.settings.newPassword")}>
              <Input
                type="password"
                value={account.newPassword}
                onChange={(e) => setAccount((a) => ({ ...a, newPassword: e.target.value }))}
                autoComplete="new-password"
              />
            </Row>
            <Row label={t("pages.settings.actions")}>
              <Button type="button" variant="primary" onClick={() => void saveAccount()} className="!gap-2">
                <Save size={16} />
                {t("update")}
              </Button>
            </Row>
          </SettingsSection>

          <SettingsSection
            title={t("pages.settings.sections.adminRestart")}
            hint={t("pages.settings.restartPanelDesc")}
            icon={Power}
            iconTone="warning"
          >
            <Row label={t("pages.settings.actions")}>
              <Button type="button" variant="secondary" className="!gap-2" onClick={() => setRestartOpen(true)}>
                <Power size={16} />
                {t("pages.settings.restartPanel")}
              </Button>
            </Row>
          </SettingsSection>
        </SettingsGrid>
      ) : null}
    </>
  );

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.settings")}
        eyebrow={activeTabLabel}
        description={t("pages.settings.infoDesc")}
        icon={SettingsGearIcon}
        iconTone="neutral"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => void load()} loading={loading} className="!gap-2">
              <RefreshCw size={16} />
              {t("refresh")}
            </Button>
            <Button variant="secondary" onClick={revert} disabled={!dirty} className="!gap-2">
              <RotateCcw size={16} />
              {t("reset")}
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty} className="!gap-2">
              <Save size={16} />
              {t("pages.settings.save")}
            </Button>
          </div>
        }
      />

      {dirty ? (
        <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-[var(--fg)]">
          {t("pages.settings.unsavedHint", { defaultValue: "You have unsaved changes." })}
        </div>
      ) : null}

      <div className="min-w-0">
        {tabNav}
        <div
          className="min-w-0"
          role="tabpanel"
          id={`settings-panel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {panelBody}
        </div>
      </div>

      <ConfirmDialog
        open={restartOpen}
        title={t("pages.settings.restartPanel")}
        description={t("pages.settings.restartPanelDesc")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        danger
        loading={restartLoading}
        onCancel={() => setRestartOpen(false)}
        onConfirm={doRestart}
      />

      <ConfirmDialog
        open={multiConfirmOpen}
        title={t("pages.settings.multiNodeMode")}
        description={t("pages.settings.enableMultiNodeModeConfirm")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onCancel={() => setMultiConfirmOpen(false)}
        onConfirm={() => {
          patch("multiNodeMode", true);
          setMultiConfirmOpen(false);
        }}
      />
    </PageScaffold>
  );
}
