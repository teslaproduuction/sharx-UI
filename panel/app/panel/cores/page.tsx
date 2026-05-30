"use client";

import { Boxes, Copy, FileJson, Network, RefreshCw, RotateCw, ScrollText, Server, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, Modal, Spinner, useToast } from "@/components/ui";

type SingboxResp = { config: unknown; configHash: string };
type SingboxOverridesResp = { overrides: string };
type TelemtPayload = { inboundId: number; tag: string; toml: string };

type Tab = "xray" | "singbox" | "telemt";
type CoreKind = "xray" | "singbox" | "telemt";
type CoresStatus = {
  xray: { running: boolean };
  singbox: { running: boolean; configHash: string; uptimeSec?: number; version?: string };
  telemt: { running: boolean; instanceCount: number; uptimeSec?: number; version?: string };
};

function fmtUptime(sec?: number): string {
  if (!sec || sec <= 0) return "";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
type LogLine = { tsUnixMs: number; text: string };

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("xray");
  const [loading, setLoading] = useState(false);
  const [xray, setXray] = useState<unknown>(null);
  const [singbox, setSingbox] = useState<SingboxResp | null>(null);
  const [telemt, setTelemt] = useState<TelemtPayload[]>([]);
  const [error, setError] = useState<string>("");
  const [overrides, setOverrides] = useState<string>("{}");
  const [overridesDirty, setOverridesDirty] = useState(false);
  const [overridesSaving, setOverridesSaving] = useState(false);

  // Control cards: live status + stop/restart + logs.
  const [status, setStatus] = useState<CoresStatus | null>(null);
  const [busyCore, setBusyCore] = useState<CoreKind | null>(null);
  const [logsCore, setLogsCore] = useState<CoreKind | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    const r = await getJson<CoresStatus>(panel("cores/status"));
    if (r.success && r.obj) setStatus(r.obj);
  }, []);

  useEffect(() => {
    void loadStatus();
    const id = setInterval(() => void loadStatus(), 5000);
    return () => clearInterval(id);
  }, [loadStatus]);

  const controlCore = useCallback(
    async (core: CoreKind, action: "stop" | "restart") => {
      setBusyCore(core);
      const path =
        core === "xray"
          ? action === "stop"
            ? "server/stopXrayService"
            : "server/restartXrayService"
          : `cores/${core}/${action}`;
      const r = await postJson(panel(path), {}, true);
      setBusyCore(null);
      if (r.success) {
        toast.success(
          r.msg ||
            t(`pages.cores.${action}OkToast`, {
              core,
              defaultValue: action === "stop" ? `${core} stopped` : `${core} restarted`,
            }),
        );
        void loadStatus();
      } else {
        toast.error(r.msg || t("pages.cores.actionFailed", { defaultValue: "Action failed" }));
      }
    },
    [loadStatus, t, toast],
  );

  const openLogs = useCallback(
    async (core: CoreKind) => {
      setLogsCore(core);
      setLogLines([]);
      setLogsLoading(true);
      const path = core === "xray" ? "server/xraylogs/500" : `cores/${core}/logs`;
      const r =
        core === "xray"
          ? await postJson<string[]>(panel(path), {}, true)
          : await getJson<LogLine[]>(panel(path));
      setLogsLoading(false);
      if (r.success && Array.isArray(r.obj)) {
        const lines: LogLine[] =
          core === "xray"
            ? (r.obj as unknown as string[]).map((s) => ({ tsUnixMs: 0, text: String(s) }))
            : (r.obj as LogLine[]);
        setLogLines(lines);
      }
    },
    [],
  );

  const refreshLogs = useCallback(() => {
    if (logsCore) void openLogs(logsCore);
  }, [logsCore, openLogs]);

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
        const ov = await getJson<SingboxOverridesResp>(panel("singbox/overrides"));
        if (ov.success && ov.obj) {
          let pretty = ov.obj.overrides || "{}";
          try { pretty = JSON.stringify(JSON.parse(pretty), null, 2); } catch { /* keep raw */ }
          setOverrides(pretty);
          setOverridesDirty(false);
        }
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

  const saveOverrides = async () => {
    try { JSON.parse(overrides); } catch {
      toast.error(t("pages.cores.invalidJson", { defaultValue: "Invalid JSON" }));
      return;
    }
    setOverridesSaving(true);
    const r = await postJson(panel("singbox/overrides"), { overrides }, true);
    setOverridesSaving(false);
    if (r.success) {
      toast.success(t("pages.cores.savedToast", { defaultValue: "Saved — sing-box will reload" }));
      setOverridesDirty(false);
      void load("singbox");
    } else {
      toast.error(r.msg || t("pages.cores.fetchFailed", { defaultValue: "Failed" }));
    }
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
      {/* Unified control cards: status + stop/restart + logs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CoreCard
          kind="xray"
          icon={Network}
          title="Xray"
          running={status?.xray.running ?? null}
          meta={t("pages.cores.cardXrayMeta", { defaultValue: "Core proxy engine" })}
          busy={busyCore === "xray"}
          onStop={() => void controlCore("xray", "stop")}
          onRestart={() => void controlCore("xray", "restart")}
          onLogs={() => void openLogs("xray")}
          t={t}
        />
        <CoreCard
          kind="singbox"
          icon={Boxes}
          title="Sing-box"
          running={status?.singbox.running ?? null}
          meta={
            [
              status?.singbox.version ? `v${status.singbox.version}` : null,
              fmtUptime(status?.singbox.uptimeSec) ? `↑ ${fmtUptime(status?.singbox.uptimeSec)}` : null,
              status?.singbox.configHash ? `${status.singbox.configHash.slice(0, 8)}…` : null,
            ]
              .filter(Boolean)
              .join(" · ") || t("pages.cores.cardSingboxMeta", { defaultValue: "mieru / AnyTLS / TUIC / Naive" })
          }
          busy={busyCore === "singbox"}
          onStop={() => void controlCore("singbox", "stop")}
          onRestart={() => void controlCore("singbox", "restart")}
          onLogs={() => void openLogs("singbox")}
          t={t}
        />
        <CoreCard
          kind="telemt"
          icon={Server}
          title="Telemt"
          running={status?.telemt.running ?? null}
          meta={
            [
              status?.telemt.version ? `v${status.telemt.version}` : null,
              fmtUptime(status?.telemt.uptimeSec) ? `↑ ${fmtUptime(status?.telemt.uptimeSec)}` : null,
              t("pages.cores.cardTelemtMeta", {
                count: status?.telemt.instanceCount ?? 0,
                defaultValue: `${status?.telemt.instanceCount ?? 0} instance(s)`,
              }),
            ]
              .filter(Boolean)
              .join(" · ")
          }
          busy={busyCore === "telemt"}
          onStop={() => void controlCore("telemt", "stop")}
          onRestart={() => void controlCore("telemt", "restart")}
          onLogs={() => void openLogs("telemt")}
          t={t}
        />
      </div>

      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.cores.subtitle", { defaultValue: "Inspect cores." })}
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
          <div className="space-y-5">
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.singboxHint", { defaultValue: "Singleton sing-box." })}
            </p>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {t("pages.cores.liveSection", { defaultValue: "Live config" })}
                </p>
                <div className="flex items-center gap-2">
                  {singbox?.configHash ? (
                    <span className="text-[11px] font-mono text-[var(--fg-muted)]">
                      {t("pages.cores.configHash", { defaultValue: "Hash" })}: {singbox.configHash.slice(0, 16)}…
                    </span>
                  ) : null}
                  <Button variant="secondary" onClick={() => copy(singboxJson)} disabled={!singboxJson}>
                    <Copy className="mr-1 size-4 inline" />
                    {t("pages.cores.copyButton", { defaultValue: "Copy" })}
                  </Button>
                </div>
              </div>
              <pre className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
                {singboxJson || "{}"}
              </pre>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {t("pages.cores.overridesSection", { defaultValue: "Overrides (JSON)" })}
                </p>
                <Button
                  onClick={() => void saveOverrides()}
                  disabled={overridesSaving || !overridesDirty}
                >
                  {overridesSaving
                    ? t("pages.cores.savingButton", { defaultValue: "Saving…" })
                    : t("pages.cores.saveButton", { defaultValue: "Save + reload" })}
                </Button>
              </div>
              <p className="mb-2 text-[11px] text-[var(--fg-subtle)]">
                {t("pages.cores.overridesHint", { defaultValue: "JSON object with optional keys." })}
              </p>
              <textarea
                value={overrides}
                onChange={(e) => { setOverrides(e.target.value); setOverridesDirty(true); }}
                spellCheck={false}
                className="block w-full min-h-[200px] resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)] outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        ) : (
          <>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.telemtHint", { defaultValue: "Per-instance Telemt TOML." })}
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

      <Modal
        open={logsCore != null}
        onClose={() => setLogsCore(null)}
        title={t("pages.cores.logsTitle", { core: logsCore ?? "", defaultValue: `${logsCore} logs` })}
        width={840}
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.cores.logsHint", { defaultValue: "Last 500 stdout/stderr lines. Errors highlighted." })}
            </p>
            <Button variant="secondary" onClick={refreshLogs} disabled={logsLoading}>
              <RefreshCw className="mr-1 size-4 inline" />
              {t("pages.cores.refreshButton", { defaultValue: "Refresh" })}
            </Button>
          </div>
          {logsLoading ? (
            <div className="grid min-h-48 place-items-center"><Spinner size={28} /></div>
          ) : logLines.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
              {t("pages.cores.logsEmpty", { defaultValue: "No log lines captured yet (sidecar may be stopped)." })}
            </p>
          ) : (
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono leading-relaxed">
              {logLines.map((l, i) => {
                const isErr = /error|fatal|panic|fail|exit|refused|denied/i.test(l.text);
                return (
                  <div key={i} className={isErr ? "text-rose-400" : "text-[var(--fg)]"}>
                    {l.tsUnixMs ? (
                      <span className="mr-2 text-[var(--fg-subtle)]">
                        {new Date(l.tsUnixMs).toLocaleTimeString()}
                      </span>
                    ) : null}
                    {l.text}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </Modal>
    </PageScaffold>
  );
}

function CoreCard({
  icon: Icon,
  title,
  running,
  meta,
  busy,
  onStop,
  onRestart,
  onLogs,
  t,
}: {
  kind: CoreKind;
  icon: typeof Network;
  title: string;
  running: boolean | null;
  meta: string;
  busy: boolean;
  onStop: () => void;
  onRestart: () => void;
  onLogs: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  return (
    <Surface padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[var(--accent)]">
            <Icon size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--fg)]">{title}</p>
            <p className="text-[11px] text-[var(--fg-muted)]">{meta}</p>
          </div>
        </div>
        <StatusPill running={running} t={t} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className="!gap-1.5 !text-xs" onClick={onRestart} disabled={busy}>
          <RotateCw size={14} />
          {t("pages.cores.restartButton", { defaultValue: "Restart" })}
        </Button>
        <Button variant="secondary" className="!gap-1.5 !text-xs text-rose-300" onClick={onStop} disabled={busy || running === false}>
          <Square size={14} />
          {t("pages.cores.stopButton", { defaultValue: "Stop" })}
        </Button>
        <Button variant="ghost" className="!gap-1.5 !text-xs" onClick={onLogs}>
          <ScrollText size={14} />
          {t("pages.cores.logsButton", { defaultValue: "Logs" })}
        </Button>
      </div>
    </Surface>
  );
}

function StatusPill({ running, t }: { running: boolean | null; t: ReturnType<typeof useTranslation>["t"] }) {
  if (running == null) {
    return (
      <span className="rounded-full bg-[var(--bg-elevated)] px-2 py-0.5 text-[10px] text-[var(--fg-muted)]">
        …
      </span>
    );
  }
  return running ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
      <span className="size-1.5 rounded-full bg-emerald-400" />
      {t("pages.cores.running", { defaultValue: "running" })}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-300">
      <span className="size-1.5 rounded-full bg-rose-400" />
      {t("pages.cores.stopped", { defaultValue: "stopped" })}
    </span>
  );
}
