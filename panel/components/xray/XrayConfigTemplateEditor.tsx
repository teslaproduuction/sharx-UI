"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  patchSimpleCore,
  type XraySimpleCore,
} from "@/lib/xraySimpleCore";
import {
  extractSectionJson,
  getOrderedTemplateKeys,
  isTemplateJsonValid,
  mergeSectionIntoTemplate,
} from "@/lib/xrayTemplateSlice";
import { p } from "@/lib/paths";
import { Surface } from "@/components/panel";
import { XrayTemplateNav, type XrayTemplateNavId } from "@/components/XrayTemplateNav";
import { Spinner, useToast } from "@/components/ui";
import { sectionButtonLabel } from "@/components/xray/sectionButtonLabel";
import { SimpleCoreForm } from "@/components/xray/SimpleCoreForm";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type SectionKey = "full" | string;

export type XrayConfigTemplateEditorHandle = {
  /** Merged valid JSON or null if save must be blocked */
  getJsonForSave: () => string | null;
};

type Props = {
  template: string;
  onTemplateChange: (next: string) => void;
  /** Increment when loading new data from server so nav resets */
  syncKey: string | number;
  readOnly?: boolean;
  loading?: boolean;
};

export const XrayConfigTemplateEditor = forwardRef<XrayConfigTemplateEditorHandle, Props>(
  function XrayConfigTemplateEditor(
    { template, onTemplateChange, syncKey, readOnly = false, loading = false },
    ref,
  ) {
    const { t } = useTranslation();
    const toast = useToast();
    const [navId, setNavId] = useState<XrayTemplateNavId>("general");
    const [sectionDraft, setSectionDraft] = useState("{}");
    const [dataEpoch, setDataEpoch] = useState(0);
    const [sectionParseError, setSectionParseError] = useState<string | null>(null);

    const sectionKey = useMemo<SectionKey>(() => (navId === "general" ? "full" : navId), [navId]);

    useEffect(() => {
      setNavId("general");
      setSectionParseError(null);
      setDataEpoch((e) => e + 1);
    }, [syncKey]);

    useEffect(() => {
      if (loading) return;
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
    }, [sectionKey, dataEpoch, loading, t]);

    const templateOk = useMemo(() => isTemplateJsonValid(template), [template]);

    useEffect(() => {
      if (loading || templateOk || navId !== "general") return;
      setNavId("full");
    }, [loading, templateOk, navId]);

    const sectionKeys = useMemo(() => {
      try {
        return getOrderedTemplateKeys(JSON.parse(template) as Record<string, unknown>);
      } catch {
        return [];
      }
    }, [template]);

    const navigateTemplateNav = useCallback(
      (next: XrayTemplateNavId) => {
        if (readOnly || next === navId) return;
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
      [readOnly, navId, sectionParseError, t, toast, template],
    );

    const handleCodeChange = useCallback(
      (v: string | undefined) => {
        const val = v ?? "";
        if (readOnly || navId === "general") return;
        if (sectionKey === "full") {
          onTemplateChange(val);
          return;
        }
        setSectionDraft(val);
        try {
          onTemplateChange(mergeSectionIntoTemplate(template, sectionKey, val));
          setSectionParseError(null);
        } catch {
          setSectionParseError(t("pages.xrayCoreConfigProfiles.invalidJson"));
        }
      },
      [readOnly, navId, sectionKey, template, onTemplateChange, t],
    );

    const patchSimpleCoreSafe = useCallback(
      (p: Partial<XraySimpleCore>) => {
        if (!isTemplateJsonValid(template)) {
          toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
          return;
        }
        try {
          onTemplateChange(patchSimpleCore(template, p));
          setSectionParseError(null);
        } catch {
          toast.error(t("pages.xrayCoreConfigProfiles.invalidJson"));
        }
      },
      [template, onTemplateChange, t, toast],
    );

    const codeValue = useMemo(() => {
      if (sectionKey === "full") return template;
      return sectionDraft;
    }, [sectionKey, template, sectionDraft]);

    const showGeneralUi = navId === "general" && templateOk && !readOnly;
    const sectionLabel = useCallback((k: string) => sectionButtonLabel(t, k), [t]);

    useImperativeHandle(
      ref,
      () => ({
        getJsonForSave: () => {
          if (sectionKey !== "full" && sectionParseError) return null;
          let toSave = template;
          if (sectionKey !== "full") {
            try {
              toSave = mergeSectionIntoTemplate(template, sectionKey, sectionDraft);
            } catch {
              return null;
            }
          }
          try {
            JSON.parse(toSave);
            return toSave;
          } catch {
            return null;
          }
        },
      }),
      [template, sectionKey, sectionDraft, sectionParseError],
    );

    return (
      <>
        {!loading && !templateOk && navId !== "full" ? (
          <p className="text-sm text-rose-300">{t("pages.xrayCoreConfigProfiles.invalidJson")}</p>
        ) : null}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {!loading ? (
            <XrayTemplateNav
              navId={navId}
              onSelect={navigateTemplateNav}
              sectionKeys={sectionKeys}
              sectionLabel={sectionLabel}
              templateOk={templateOk}
              disabled={readOnly}
            />
          ) : null}

          <div className="min-w-0 flex-1 space-y-3">
            {showGeneralUi ? (
              <SimpleCoreForm template={template} onPatch={patchSimpleCoreSafe} />
            ) : null}

            {!loading && templateOk && navId !== "general" ? (
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

            {!loading && !templateOk && navId === "full" ? (
              <p className="text-sm text-rose-300">{t("pages.xrayCoreConfigProfiles.invalidJson")}</p>
            ) : null}

            <Surface padding="sm" className="overflow-x-auto">
              {loading ? (
                <div className="grid min-h-[50vh] place-items-center">
                  <Spinner size={40} />
                </div>
              ) : showGeneralUi ? (
                <p className="px-1 py-2 text-xs text-[var(--fg-muted)]">
                  {t("pages.xray.simpleJsonFooter", {
                    defaultValue:
                      "Use the menu to open routing (balancers), DNS, or the full JSON template.",
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
      </>
    );
  },
);
