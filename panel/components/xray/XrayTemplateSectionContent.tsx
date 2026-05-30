"use client";

import { useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { analyzeRoutingSection } from "@/lib/xrayRoutingForm";
import { getXrayMonacoEntryForSection, toMonacoEntry } from "@/lib/xrayMonacoJsonSchemas";
import { Button, MonacoJsonEditor, Spinner } from "@/components/ui";
import { DnsBuilder } from "@/components/xray/DnsBuilder";
import { OutboundsBuilder } from "@/components/xray/OutboundsBuilder";
import { RoutingBuilder } from "@/components/xray/RoutingBuilder";
import type { XrayTemplateNavId } from "@/components/XrayTemplateNav";

type JsonMode = { outbounds: boolean; dns: boolean; routing: boolean };

type Props = {
  navId: XrayTemplateNavId;
  sectionDraft: string;
  /** Full template string update (merge section into template) */
  applySection: (sectionJson: string) => void;
  handleCodeChange: (v: string | undefined) => void;
  codeValue: string;
  templateOk: boolean;
  loading: boolean;
  readOnly: boolean;
  showGeneralUi: boolean;
  syncKey: string | number;
  /** Outbound tags from the sibling outbounds[] — feeds the routing target dropdown. */
  outboundTags?: string[];
  t: TFunction;
};

export function XrayTemplateSectionContent({
  navId,
  sectionDraft,
  applySection,
  handleCodeChange,
  codeValue,
  templateOk,
  loading,
  readOnly,
  showGeneralUi,
  syncKey,
  outboundTags = [],
  t,
}: Props) {
  const [jsonMode, setJsonMode] = useState<JsonMode>({ outbounds: false, dns: false, routing: false });

  const routingKind = useMemo(() => {
    if (navId !== "routing" || !templateOk) return "visual" as const;
    return analyzeRoutingSection(sectionDraft);
  }, [navId, sectionDraft, templateOk]);

  const xrayMonacoEntry = useMemo(
    () => getXrayMonacoEntryForSection(String(navId), t),
    [navId, t],
  );
  const xraySchemaBundle = useMemo(() => [toMonacoEntry(xrayMonacoEntry)], [xrayMonacoEntry]);

  const showOutVisual =
    !loading && templateOk && navId === "outbounds" && !readOnly && !jsonMode.outbounds;
  const showDnsVisual = !loading && templateOk && navId === "dns" && !readOnly && !jsonMode.dns;
  const showRoutingVisual =
    !loading &&
    templateOk &&
    navId === "routing" &&
    !readOnly &&
    !jsonMode.routing &&
    routingKind === "visual";

  if (showGeneralUi) {
    return (
      <p className="px-1 py-2 text-xs text-[var(--fg-muted)]">
        {t("pages.xray.simpleJsonFooter", {
          defaultValue: "Use the menu to open routing (balancers), DNS, or the full JSON template.",
        })}
      </p>
    );
  }

  const showJsonToggle =
    !loading && templateOk && (navId === "outbounds" || navId === "dns" || navId === "routing");
  const showJsonModeButton =
    navId === "outbounds" || navId === "dns" || (navId === "routing" && routingKind === "visual");

  return (
    <div className="min-w-0 space-y-2">
      {showJsonToggle ? (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          {navId === "routing" && routingKind === "advanced" ? (
            <p className="min-w-0 flex-1 text-xs text-amber-200/90 sm:min-w-[12rem]">
              {t("pages.xray.routingBuilder.advancedOnly")}
            </p>
          ) : null}
          {showJsonModeButton ? (
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              {navId === "outbounds" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => setJsonMode((m) => ({ ...m, outbounds: !m.outbounds }))}
                >
                  {jsonMode.outbounds
                    ? t("pages.xray.templateSection.visualBuilder")
                    : t("pages.xray.templateSection.editAsJson")}
                </Button>
              ) : null}
              {navId === "dns" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => setJsonMode((m) => ({ ...m, dns: !m.dns }))}
                >
                  {jsonMode.dns
                    ? t("pages.xray.templateSection.visualBuilder")
                    : t("pages.xray.templateSection.editAsJson")}
                </Button>
              ) : null}
              {navId === "routing" && routingKind === "visual" ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => setJsonMode((m) => ({ ...m, routing: !m.routing }))}
                >
                  {jsonMode.routing
                    ? t("pages.xray.templateSection.visualBuilder")
                    : t("pages.xray.templateSection.editAsJson")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="min-h-[50vh] overflow-hidden rounded-xl border border-[var(--border)]">
        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <Spinner size={40} />
          </div>
        ) : showOutVisual ? (
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <OutboundsBuilder
              value={sectionDraft}
              onChange={applySection}
              readOnly={readOnly}
              t={t}
              syncKey={syncKey}
            />
          </div>
        ) : showDnsVisual ? (
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <DnsBuilder
              value={sectionDraft}
              onChange={applySection}
              readOnly={readOnly}
              t={t}
              syncKey={syncKey}
            />
          </div>
        ) : showRoutingVisual ? (
          <div className="max-h-[70vh] overflow-y-auto p-3">
            <RoutingBuilder
              value={sectionDraft}
              onChange={applySection}
              readOnly={readOnly}
              t={t}
              syncKey={syncKey}
              outboundTags={outboundTags}
            />
          </div>
        ) : (
          <MonacoJsonEditor
            key={xrayMonacoEntry.fileName}
            path={xrayMonacoEntry.fileName}
            height="70vh"
            value={codeValue}
            onChange={handleCodeChange}
            readOnly={readOnly}
            schemaBundle={xraySchemaBundle}
          />
        )}
      </div>
    </div>
  );
}
