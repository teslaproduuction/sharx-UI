"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  extractSimpleCore,
  isKnownDomainStrategy,
  isKnownLogLevel,
  type XraySimpleCore,
} from "@/lib/xraySimpleCore";
import { CheckboxField, Input, SelectNative } from "@/components/ui";

export function SimpleCoreForm({
  template,
  onPatch,
}: {
  template: string;
  onPatch: (p: Partial<XraySimpleCore>) => void;
}) {
  const { t } = useTranslation();
  const v = useMemo(() => extractSimpleCore(template), [template]);
  const accessToFile = v.access !== "none";

  const logLevelOptions = useMemo(() => {
    const base = ["debug", "info", "warning", "error", "none"] as const;
    const o = new Set(base);
    if (!o.has(v.loglevel as (typeof base)[number])) {
      return [v.loglevel, ...base];
    }
    return [...base];
  }, [v.loglevel]);

  const domainOptions = useMemo(() => {
    const base = ["AsIs", "IPIfNonMatch", "IPOnDemand"] as const;
    const o = new Set(base);
    if (!o.has(v.domainStrategy as (typeof base)[number])) {
      return [v.domainStrategy, ...base];
    }
    return [...base];
  }, [v.domainStrategy]);

  return (
    <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--fg)]">
          {t("pages.xray.simpleSectionTitle", { defaultValue: "Core (quick setup)" })}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">
          {t("pages.xray.simpleSectionHint", {
            defaultValue:
              "Common options without editing JSON. Use the menu for routing (balancers), DNS, and other sections.",
          })}
        </p>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.logLevel")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.logLevelDesc")}</div>
        </div>
        <SelectNative value={v.loglevel} onChange={(e) => onPatch({ loglevel: e.target.value })}>
          {logLevelOptions.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
              {!isKnownLogLevel(lvl) ? ` (${t("pages.xray.customValue", { defaultValue: "custom" })})` : ""}
            </option>
          ))}
        </SelectNative>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.accessLog")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.accessLogDesc")}</div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <CheckboxField
            label={t("pages.xray.accessLogToFile", { defaultValue: "Write access log to a file" })}
            checked={accessToFile}
            onChange={(e) => {
              const on = e.target.checked;
              onPatch({
                access: on ? (v.access !== "none" ? v.access : "/var/log/xray/access.log") : "none",
              });
            }}
          />
          {accessToFile ? (
            <Input
              value={v.access === "none" ? "" : v.access}
              onChange={(e) => onPatch({ access: e.target.value.trim() || "none" })}
              placeholder="/var/log/xray/access.log"
              className="w-full"
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.errorLog")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.errorLogDesc")}</div>
        </div>
        <Input
          value={v.error}
          onChange={(e) => onPatch({ error: e.target.value })}
          placeholder="none"
          className="w-full"
        />
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.dnsLog")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.dnsLogDesc")}</div>
        </div>
        <CheckboxField
          label={t("pages.xray.dnsLogEnable", { defaultValue: "Enable DNS query logging" })}
          checked={v.dnsLog}
          onChange={(e) => onPatch({ dnsLog: e.target.checked })}
        />
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.maskAddress")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.maskAddressDesc")}</div>
        </div>
        <Input
          value={v.maskAddress}
          onChange={(e) => onPatch({ maskAddress: e.target.value })}
          placeholder=""
          className="w-full"
        />
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(160px,260px)_1fr] sm:items-start">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--fg-muted)]">{t("pages.xray.RoutingStrategy")}</div>
          <div className="mt-0.5 text-xs text-[var(--fg-subtle)]">{t("pages.xray.RoutingStrategyDesc")}</div>
        </div>
        <SelectNative
          value={v.domainStrategy}
          onChange={(e) => onPatch({ domainStrategy: e.target.value })}
        >
          {domainOptions.map((ds) => (
            <option key={ds} value={ds}>
              {ds}
              {!isKnownDomainStrategy(ds)
                ? ` (${t("pages.xray.customValue", { defaultValue: "custom" })})`
                : ""}
            </option>
          ))}
        </SelectNative>
      </div>
    </div>
  );
}
