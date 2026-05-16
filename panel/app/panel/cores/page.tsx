"use client";

import { Copy, FileJson, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, Spinner, useToast } from "@/components/ui";

type SingboxResp = { config: unknown; configHash: string };
type TelemtPayload = { inboundId: number; tag: string; toml: string };

type Tab = "xray" | "singbox" | "telemt";

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("xray");
  const [loading, setLoading] = useState(false);
  const [xray, setXray] = useState<unknown>(null);
  const [singbox, setSingbox] = useState<SingboxResp | null>(null);
  const [telemt, setTelemt] = useState<TelemtPayload[]>([]);
  const [error, setError] = useState<string>("");

  const load = useCallback(async (which: Tab) => {
    setLoading(true);
    setError("");
    try {
      if (which === "xray") {
        const r = await getJson<unknown>(panel("cores/xray"));
        if (r.success) setXray(r.obj);
        else setError(r.msg || t("pages.cores.fetchFailed", { defaultValue: "Failed to fetch" }));
      } else if (which === "singbox") {
        const r = await getJson<SingboxResp>(panel("cores/singbox"));
        if (r.success && r.obj) setSingbox(r.obj);
        else setError(r.msg || t("pages.cores.fetchFailed", { defaultValue: "Failed to fetch" }));
      } else {
        const r = await getJson<TelemtPayload[]>(panel("cores/telemt"));
        if (r.success && Array.isArray(r.obj)) setTelemt(r.obj);
        else setError(r.msg || t("pages.cores.fetchFailed", { defaultValue: "Failed to fetch" }));
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(tab); }, [tab, load]);

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(t("pages.cores.copiedToast", { defaultValue: "Copied" }));
  };

  const xrayJson = xray ? JSON.stringify(xray, null, 2) : "";
  const singboxJson = singbox?.config ? JSON.stringify(singbox.config, null, 2) : "";

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.cores.title", { defaultValue: "Cores Inspector" })}
        icon={FileJson}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.cores.subtitle", { defaultValue: "Read-only dumps of the live config the panel would push to each core right now." })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(["xray", "singbox", "telemt"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                tab === k
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                  : "border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
              }`}
            >
              {t(`pages.cores.tab${k.charAt(0).toUpperCase()}${k.slice(1)}`, { defaultValue: k })}
            </button>
          ))}
          <Button variant="secondary" onClick={() => void load(tab)} disabled={loading}>
            <RefreshCw className="mr-1 size-4 inline" />
            {t("pages.cores.refreshButton", { defaultValue: "Refresh" })}
          </Button>
        </div>
      </Surface>

      <Surface padding="md" className="space-y-3">
        {loading ? (
          <div className="grid min-h-48 place-items-center"><Spinner size={32} /></div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : tab === "xray" ? (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.xrayHint", { defaultValue: "Aggregated xray config." })}
            </p>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => copy(xrayJson)} disabled={!xrayJson}>
                <Copy className="mr-1 size-4 inline" />
                {t("pages.cores.copyButton", { defaultValue: "Copy" })}
              </Button>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
              {xrayJson || "{}"}
            </pre>
          </>
        ) : tab === "singbox" ? (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.singboxHint", { defaultValue: "Singleton sing-box config." })}
            </p>
            {singbox?.configHash ? (
              <p className="text-[11px] font-mono text-[var(--fg-muted)]">
                {t("pages.cores.configHash", { defaultValue: "Hash" })}: {singbox.configHash.slice(0, 16)}…
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => copy(singboxJson)} disabled={!singboxJson}>
                <Copy className="mr-1 size-4 inline" />
                {t("pages.cores.copyButton", { defaultValue: "Copy" })}
              </Button>
            </div>
            <pre className="max-h-[70vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
              {singboxJson || "{}"}
            </pre>
          </>
        ) : (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.telemtHint", { defaultValue: "Per-instance Telemt TOML files." })}
            </p>
            {telemt.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">
                {t("pages.cores.emptyTelemt", { defaultValue: "No Telemt inbounds enabled." })}
              </p>
            ) : (
              telemt.map((p) => (
                <div key={p.inboundId} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-mono text-[var(--fg)]">
                      #{p.inboundId} <span className="text-[var(--fg-muted)]">·</span> {p.tag}
                    </p>
                    <Button variant="secondary" onClick={() => copy(p.toml)}>
                      <Copy className="mr-1 size-4 inline" />
                      {t("pages.cores.copyButton", { defaultValue: "Copy" })}
                    </Button>
                  </div>
                  <pre className="max-h-[40vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
                    {p.toml}
                  </pre>
                </div>
              ))
            )}
          </>
        )}
      </Surface>
    </PageScaffold>
  );
}
