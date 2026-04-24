"use client";

import { RefreshCw, RotateCcw, Save, Wand2, FileCode2, Radio, Wrench } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { patchSimpleCore, type XraySimpleCore } from "@/lib/xraySimpleCore";
import {
  extractSectionJson,
  getOrderedTemplateKeys,
  isTemplateJsonValid,
  mergeSectionIntoTemplate,
} from "@/lib/xrayTemplateSlice";
import { panel, p } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { XrayTemplateNav, type XrayTemplateNavId } from "@/components/XrayTemplateNav";
import { sectionButtonLabel } from "@/components/xray/sectionButtonLabel";
import { SimpleCoreForm } from "@/components/xray/SimpleCoreForm";
import { Button, ConfirmDialog, Spinner, useToast } from "@/components/ui";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type XrayView = "template" | "runtime";
type SectionKey = "full" | string;

function parsePanelObj<T>(obj: unknown): T | null {
  let raw: unknown = obj;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  return raw as T;
}

function templateToString(xraySetting: unknown): string {
  if (xraySetting == null) return "{}";
  if (typeof xraySetting === "string") {
    try {
      return JSON.stringify(JSON.parse(xraySetting), null, 2);
    } catch {
      return xraySetting;
    }
  }
  return JSON.stringify(xraySetting, null, 2);
}

export function XrayPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [view, setView] = useState<XrayView>("template");
  const [navId, setNavId] = useState<XrayTemplateNavId>("general");
  const [sectionDraft, setSectionDraft] = useState("{}");
  const [dataEpoch, setDataEpoch] = useState(0);
  const [sectionParseError, setSectionParseError] = useState<string | null>(null);
  const [template, setTemplate] = useState("{}");
  const [baseline, setBaseline] = useState("{}");
  const [runtime, setRuntime] = useState("{}");
  const [inboundTags, setInboundTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingRuntime, setLoadingRuntime] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [multi, setMulti] = useState(false);
  const [xrayState, setXrayState] = useState<string | null>(null);

  const sectionKey = useMemo<SectionKey>(() => (navId === "general" ? "full" : navId), [navId]);

  const loadSettingsFlags = useCallback(async () => {
    const s = await postJson<Record<string, unknown>>(panel("setting/all"));
    if (s.success && s.obj) {
      setMulti(Boolean((s.obj as { multiNodeMode?: boolean }).multiNodeMode));
    }
  }, []);

  const loadTemplate = useCallback(async () => {
    setLoading(true);
    const r = await postJson<unknown>(panel("xray/"), {});
    setLoading(false);
    if (!r.success) {
      toast.error(r.msg || t("pages.settings.toasts.getSettings"));
      return;
    }
    const parsed = parsePanelObj<{
      xraySetting: unknown;
      inboundTags: unknown;
    }>(r.obj);
    if (!parsed) {
      toast.error(t("fail"));
      return;
    }
    const tStr = templateToString(parsed.xraySetting);
    setTemplate(tStr);
    setBaseline(tStr);
    setNavId("general");
    setDataEpoch((e) => e + 1);
    setSectionParseError(null);
    const tags = parsed.inboundTags;
    if (Array.isArray(tags)) {
      setInboundTags(tags.filter((x): x is string => typeof x === "string"));
    } else {
      setInboundTags([]);
    }
  }, [t, toast]);

  const loadRuntime = useCallback(async () => {
    setLoadingRuntime(true);
    const r = await getJson<unknown>(panel("api/server/getConfigJson"));
    setLoadingRuntime(false);
    if (r.success) {
      setRuntime(JSON.stringify(r.obj, null, 2));
    } else {
      toast.error(r.msg || t("pages.settings.toasts.getSettings"));
    }
  }, [t, toast]);

  const loadXrayHint = useCallback(async () => {
    const r = await getJson<string>(panel("xray/getXrayResult"));
    if (r.success && r.obj) {
      setXrayState(typeof r.obj === "string" ? r.obj : null);
    }
  }, []);

  useEffect(() => {
    void loadSettingsFlags();
  }, [loadSettingsFlags]);

  useEffect(() => {
    void loadTemplate();
  }, [loadTemplate]);

  useEffect(() => {
    if (view === "runtime") {
      void loadRuntime();
    }
  }, [view, loadRuntime]);

  useEffect(() => {
    void loadXrayHint();
  }, [loadXrayHint]);

  useEffect(() => {
    if (view !== "template" || loading) return;
    if (sectionKey === "full") {
      setSectionParseError(null);
      return;
    }
    try {
      const root = JSON.parse(template) as Record<string, unknown>;
      setSectionDraft(extractSectionJson(root, sectionKey));
      setSectionParseError(null);
    } catch {
      setSectionDraft("{}");
      setSectionParseError(t("pages.xrayCoreConfigProfiles.invalidJson"));
    }
    // `template` omitted on purpose: we only resync a section when the tab or a reload reverts the buffer.
  }, [sectionKey, dataEpoch, view, loading, t]);

  const templateOk = useMemo(() => isTemplateJsonValid(template), [template]);

  useEffect(() => {
    if (view !== "template" || loading || templateOk || navId !== "general") return;
    setNavId("full");
  }, [view, loading, templateOk, navId]);

  const sectionKeys = useMemo(() => {
    if (view !== "template") return [];
    try {
      return getOrderedTemplateKeys(JSON.parse(template) as Record<string, unknown>);
    } catch {
      return [];
    }
  }, [view, template]);

  const navigateTemplateNav = useCallback(
    (next: XrayTemplateNavId) => {
      if (view !== "template" || next === navId) return;
      if (next !== "general" && next !== "full" && !isTemplateJsonValid(template)) {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        return;
      }
      if (navId !== "general" && navId !== "full" && sectionParseError) {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        return;
      }
      setNavId(next);
      if (next === "general") {
        setSectionParseError(null);
      }
    },
    [view, navId, sectionParseError, t, toast, template],
  );

  const dirty = useMemo(
    () =>
      view === "template" &&
      (template !== baseline || (sectionKey !== "full" && sectionParseError !== null)),
    [view, template, baseline, sectionKey, sectionParseError],
  );

  const save = async () => {
    if (view !== "template") return;
    if (sectionKey !== "full" && sectionParseError) {
      toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
      return;
    }
    let toSave = template;
    if (sectionKey !== "full") {
      try {
        toSave = mergeSectionIntoTemplate(template, sectionKey, sectionDraft);
      } catch {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        return;
      }
    }
    try {
      JSON.parse(toSave);
    } catch {
      toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
      return;
    }
    setSaving(true);
    const r = await postJson(panel("xray/update"), { xraySetting: toSave });
    setSaving(false);
    if (r.success) {
      toast.success(r.msg || t("success"));
      setTemplate(toSave);
      setBaseline(toSave);
      setDataEpoch((e) => e + 1);
      setSectionParseError(null);
      await loadRuntime();
    } else {
      toast.error(r.msg || t("pages.settings.toasts.modifySettings"));
    }
  };

  const revert = () => {
    if (view === "template") {
      setTemplate(baseline);
      setNavId("general");
      setDataEpoch((e) => e + 1);
      setSectionParseError(null);
    }
  };

  const doReset = async () => {
    setResetting(true);
    const r = await postJson(panel("xray/resetToDefault"), {});
    setResetting(false);
    setResetOpen(false);
    if (r.success) {
      toast.success(r.msg || t("success"));
      await loadTemplate();
      await loadRuntime();
    } else {
      toast.error(r.msg || t("pages.settings.toasts.modifySettings"));
    }
  };

  const setViewMode = useCallback(
    (next: XrayView) => {
      if (
        next === "runtime" &&
        navId !== "general" &&
        navId !== "full" &&
        sectionParseError
      ) {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        return;
      }
      setView(next);
    },
    [navId, sectionParseError, t, toast],
  );

  const handleCodeChange = useCallback(
    (v: string | undefined) => {
      const val = v ?? "";
      if (view === "runtime" || navId === "general") return;
      if (sectionKey === "full") {
        setTemplate(val);
        return;
      }
      setSectionDraft(val);
      try {
        setTemplate(mergeSectionIntoTemplate(template, sectionKey, val));
        setSectionParseError(null);
      } catch {
        setSectionParseError(t("pages.xrayCoreConfigProfiles.invalidJson"));
      }
    },
    [view, navId, sectionKey, template, t],
  );

  const patchSimpleCoreSafe = useCallback(
    (p: Partial<XraySimpleCore>) => {
      if (!isTemplateJsonValid(template)) {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        return;
      }
      try {
        setTemplate(patchSimpleCore(template, p));
        setSectionParseError(null);
      } catch {
        toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
      }
    },
    [template, t, toast],
  );

  const codeValue = useMemo(() => {
    if (view === "runtime") return runtime;
    if (sectionKey === "full") return template;
    return sectionDraft;
  }, [view, sectionKey, template, sectionDraft, runtime]);

  const readOnly = view === "runtime";
  const showGeneralUi = view === "template" && navId === "general" && templateOk;
  const showSpinner =
    (view === "template" && loading) || (view === "runtime" && loadingRuntime);

  const sectionLabel = useCallback((k: string) => sectionButtonLabel(t, k), [t]);

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.xray.title")}
        description={
          view === "template" ? t("pages.xray.TemplateDesc") : t("pages.xray.runtimeView")
        }
        icon={Wrench}
        iconTone="accent"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="mr-auto flex min-w-0 flex-wrap items-center gap-1 sm:mr-2">
              <Button
                type="button"
                variant={view === "template" ? "primary" : "secondary"}
                onClick={() => setViewMode("template")}
                className="!gap-2"
              >
                <FileCode2 size={16} />
                {t("pages.xray.Template")}
              </Button>
              <Button
                type="button"
                variant={view === "runtime" ? "primary" : "secondary"}
                onClick={() => setViewMode("runtime")}
                className="!gap-2"
              >
                <Radio size={16} />
                {t("pages.xray.runtimeView")}
              </Button>
            </div>
            {view === "template" && (
              <>
                <Button variant="secondary" onClick={() => void loadTemplate()} loading={loading} className="!gap-2">
                  <RefreshCw size={16} />
                  {t("refresh")}
                </Button>
                <Button variant="secondary" onClick={revert} disabled={!dirty} className="!gap-2">
                  <RotateCcw size={16} />
                  {t("reset")}
                </Button>
                <Button variant="secondary" onClick={() => setResetOpen(true)} className="!gap-2">
                  <Wand2 size={16} />
                  {t("pages.xrayCoreConfigProfiles.resetToDefaultTemplate")}
                </Button>
                <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty} className="!gap-2">
                  <Save size={16} />
                  {t("pages.xray.save")}
                </Button>
              </>
            )}
            {view === "runtime" && (
              <Button
                variant="secondary"
                onClick={() => void loadRuntime()}
                loading={loadingRuntime}
                className="!gap-2"
              >
                <RefreshCw size={16} />
                {t("refresh")}
              </Button>
            )}
          </div>
        }
      />

      {multi && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/90">
          <p className="leading-relaxed">{t("pages.xray.nodeModeInfo")}</p>
          <Link
            href={p("panel/xray-core-config-profiles")}
            className="mt-2 inline-block text-[var(--accent)] underline-offset-2 hover:underline"
          >
            {t("pages.xray.openCoreProfiles")}
          </Link>
        </div>
      )}

      {inboundTags.length > 0 && (
        <p className="text-xs text-[var(--fg-muted)]">
          <span className="font-medium text-[var(--fg-subtle)]">{t("pages.xray.Inbounds")}:</span>{" "}
          {inboundTags.join(", ")}
        </p>
      )}

      {xrayState ? (
        <p className="text-xs text-[var(--fg-muted)]" title={xrayState}>
          {xrayState}
        </p>
      ) : null}

      {view === "template" && !loading && !templateOk && navId !== "full" ? (
        <p className="text-sm text-rose-300">{t("pages.xrayCoreConfigProfiles.invalidJson")}</p>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {view === "template" && !loading ? (
          <XrayTemplateNav
            navId={navId}
            onSelect={navigateTemplateNav}
            sectionKeys={sectionKeys}
            sectionLabel={sectionLabel}
            templateOk={templateOk}
          />
        ) : null}

        <div className="min-w-0 flex-1 space-y-3">
          {showGeneralUi ? (
            <SimpleCoreForm template={template} onPatch={patchSimpleCoreSafe} />
          ) : null}

          {view === "template" && !loading && templateOk && navId !== "general" ? (
            <div className="space-y-2">
              <p className="text-xs text-[var(--fg-muted)]">{t("pages.xray.sliceEditorHint")}</p>
              {navId === "routing" ? (
                <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
                  {t("pages.xray.RoutingsDesc")} {t("pages.xray.balancer.balancerDesc")}
                </p>
              ) : null}
              {navId === "dns" ? (
                <p className="text-xs text-[var(--fg-subtle)]">{t("pages.xray.dns.enableDesc")}</p>
              ) : null}
              {navId === "outbounds" ? (
                <p className="text-xs text-[var(--fg-subtle)]">{t("pages.xray.OutboundsDesc")}</p>
              ) : null}
              {navId === "inbounds" ? (
                <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
                  {t("pages.xray.inboundsTemplateHint", {
                    defaultValue:
                      "User-facing inbounds are usually managed under Inbounds. This template slice is for defaults and the API inbound.",
                  })}{" "}
                  <Link
                    href={p("panel/inbounds")}
                    className="text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    {t("menu.inbounds", { defaultValue: "Inbounds" })}
                  </Link>
                </p>
              ) : null}
              {sectionParseError ? (
                <p className="text-sm text-rose-300">{sectionParseError}</p>
              ) : null}
            </div>
          ) : null}

          {view === "template" && !loading && !templateOk && navId === "full" ? (
            <p className="text-sm text-rose-300">{t("pages.xrayCoreConfigProfiles.invalidJson")}</p>
          ) : null}

          <Surface padding="sm" className="overflow-x-auto">
            {showSpinner ? (
              <div className="grid min-h-[50vh] place-items-center">
                <Spinner size={40} />
              </div>
            ) : showGeneralUi ? (
              <p className="px-1 py-2 text-xs text-[var(--fg-muted)]">
                {t("pages.xray.simpleJsonFooter", {
                  defaultValue: "Use the menu to open routing (balancers), DNS, or the full JSON template.",
                })}
              </p>
            ) : (
              <div className="min-h-[50vh] overflow-hidden rounded-xl border border-[var(--border)]">
                <Editor
                  height="70vh"
                  defaultLanguage="json"
                  theme="vs-dark"
                  value={codeValue}
                  onChange={readOnly ? () => undefined : handleCodeChange}
                  options={{
                    readOnly,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            )}
          </Surface>
        </div>
      </div>

      <ConfirmDialog
        open={resetOpen}
        title={t("pages.xrayCoreConfigProfiles.resetToDefault")}
        description={t("pages.xray.resetServerTemplateConfirm")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => void doReset()}
        danger
        loading={resetting}
      />
    </PageScaffold>
  );
}
