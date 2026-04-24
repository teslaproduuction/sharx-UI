"use client";

import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Clock,
  CloudDownload,
  CloudUpload,
  Globe,
  History,
  LayoutDashboard,
  Link2,
  Power,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson, api } from "@/lib/api";
import { formatSecond, sizeFormat, toFixed } from "@/lib/format";
import { panel, p } from "@/lib/paths";
import { WebSocketClient } from "@/lib/useWebSocket";
import { REMNA_ACCENT } from "@/lib/theme-provider";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  AlertBanner,
  Button,
  CheckboxField,
  ConfirmDialog,
  IconButton,
  IconTile,
  LinearProgress,
  Modal,
  PillTag,
  Reveal,
  SelectNative,
  Spinner,
  Stagger,
  StaggerItem,
  StatBlock,
  useToast,
} from "@/components/ui";
import { useCountUp } from "@/lib/useCountUp";

type StatusData = {
  cpu: number;
  cpuCores: number;
  mem: { current: number; total: number };
  disk: { current: number; total: number };
  swap: { current: number; total: number };
  loads: number[];
  netIO: { up: number; down: number };
  netTraffic: { sent: number; recv: number };
  publicIP: { ipv4: string; ipv6: string };
  tcpCount: number;
  udpCount: number;
  uptime: number;
  appStats: { threads: number; mem: number; uptime: number };
  xray: { state: string; errorMsg: string; version: string };
  nodes?: { online: number; total: number };
  database: { size: number; tables: number };
};

function metricColor(percent: number, accent: string) {
  if (percent < 80) return accent;
  if (percent < 90) return "#f59e0b";
  return "#ef4444";
}

function pct(cur: number, tot: number) {
  if (!tot) return 0;
  return Number(toFixed((cur / tot) * 100, 2));
}

function xrayStateMsg(
  state: string,
  tr: (k: string) => string
): { msg: string; color: string } {
  if (state === "running")
    return { msg: tr("pages.index.xrayStatusRunning"), color: "green" };
  if (state === "stop")
    return { msg: tr("pages.index.xrayStatusStop"), color: "orange" };
  if (state === "error")
    return { msg: tr("pages.index.xrayStatusError"), color: "red" };
  return { msg: tr("pages.index.xrayStatusUnknown"), color: "default" };
}

function CountSize({ value }: { value: number }) {
  const v = useCountUp(value, { duration: 700, decimals: 0 });
  return <>{sizeFormat(v)}</>;
}

function CountNumber({ value }: { value: number }) {
  const v = useCountUp(value, { duration: 700, decimals: 0 });
  return <>{Math.round(v)}</>;
}

function xrayTagClass(color: string) {
  switch (color) {
    case "green":
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-200";
    case "orange":
      return "border-amber-500/35 bg-amber-500/10 text-amber-100";
    case "red":
      return "border-red-500/35 bg-red-500/10 text-red-200";
    default:
      return "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)]";
  }
}

export function DashboardPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const accent = REMNA_ACCENT;
  const [loading, setLoading] = useState(true);
  const [spin, setSpin] = useState(false);
  const [st, setSt] = useState<StatusData | null>(null);
  const [showSec, setShowSec] = useState(false);
  const [dontSec, setDontSec] = useState(false);
  const [showIp, setShowIp] = useState(false);
  const [multi, setMulti] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [verList, setVerList] = useState<string[]>([]);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [versionInstalling, setVersionInstalling] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [xlogOpen, setXlogOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configText, setConfigText] = useState("");
  const [cpuOpen, setCpuOpen] = useState(false);
  const [logRows, setLogRows] = useState(20);
  const [logLevel, setLogLevel] = useState("info");
  const [logSys, setLogSys] = useState(false);
  const [logText, setLogText] = useState("");
  const [xlogHtml, setXlogHtml] = useState("");
  const [cpuBucket, setCpuBucket] = useState(2);
  const [cpuLong, setCpuLong] = useState<number[]>([]);
  const [nodes, setNodes] = useState<{ id: number; name: string }[]>([]);
  const [xNode, setXNode] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("hideSecAlert") === "true") return;
    if (window.location.protocol !== "https:") setShowSec(true);
  }, []);

  const pull = useCallback(async () => {
    const msg = await getJson<StatusData>(panel("api/server/status"));
    if (msg.success && msg.obj) {
      setSt(msg.obj);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await postJson(panel("setting/defaultSettings"));
        const s = await postJson<Record<string, unknown>>(panel("setting/all"));
        if (s.success && s.obj) {
          setMulti(Boolean((s.obj as { multiNodeMode?: boolean }).multiNodeMode));
        }
      } catch {
        /* ignore */
      }
      await pull();
      setLoading(false);
    })();
  }, [pull]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = new WebSocketClient();
    c.on("status", (payload) => {
      setSt(payload as StatusData);
    });
    c.on("xray_state", (payload) => {
      const pl = payload as { state: string; errorMsg: string };
      setSt((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          xray: {
            ...prev.xray,
            state: pl.state,
            errorMsg: pl.errorMsg || "",
          },
        };
      });
    });
    c.connect();
    return () => c.close();
  }, []);

  useEffect(() => {
    if (!multi) return;
    (async () => {
      const r = await getJson<{ id: number; name: string }[]>(panel("node/list"));
      if (r.success && r.obj) {
        setNodes((r.obj || []).map((n) => ({ id: n.id, name: n.name || `Node ${n.id}` })));
      }
    })();
  }, [multi]);

  useEffect(() => {
    if (!cpuOpen) return;
    (async () => {
      setSpin(true);
      const r = await getJson<{ t: number; cpu: number }[]>(panel(`api/server/cpuHistory/${cpuBucket}`));
      setSpin(false);
      if (r.success && r.obj) {
        setCpuLong(r.obj.map((p0) => Math.max(0, Math.min(100, p0.cpu))));
      }
    })();
  }, [cpuOpen, cpuBucket]);

  if (loading) {
    return (
      <PageScaffold>
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner size={40} />
        </div>
      </PageScaffold>
    );
  }
  if (!st) {
    return (
      <PageScaffold>
        <AlertBanner type="error" title={t("noData")} />
      </PageScaffold>
    );
  }

  const cpuP = st.cpu;
  const memP = pct(st.mem.current, st.mem.total);
  const dskP = pct(st.disk.current, st.disk.total);
  const swP = pct(st.swap.current, st.swap.total);
  const nOn = st.nodes?.online ?? 0;
  const nTot = st.nodes?.total ?? 0;
  const nP = nTot ? Number(toFixed((nOn / nTot) * 100, 2)) : 0;
  const xUi = xrayStateMsg(st.xray.state, t);

  const stopX = async () => {
    setSpin(true);
    const r = await postJson(panel("api/server/stopXrayService"));
    setSpin(false);
    if (r.success) toast.success(t("success"));
  };
  const restartX = async () => {
    setSpin(true);
    const r = await postJson(panel("api/server/restartXrayService"));
    setSpin(false);
    if (r.success) toast.success(t("success"));
  };
  const openVer = async () => {
    setSpin(true);
    const r = await getJson<string[]>(panel("api/server/getXrayVersion"));
    setSpin(false);
    if (r.success && r.obj) {
      setVerList(r.obj);
      setVerOpen(true);
    }
  };

  const runInstallVersion = async () => {
    if (!pendingVersion) return;
    setVersionInstalling(true);
    setSpin(true);
    try {
      await postJson(panel(`api/server/installXray/${pendingVersion}`));
      if (multi && nodes.length) {
        const ids = nodes.map((n) => n.id);
        await postJson(
          panel(`api/server/installXrayOnNodes/${pendingVersion}`),
          { nodeIds: ids },
          true
        );
      }
      toast.success(t("success"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setSpin(false);
      setVersionInstalling(false);
      setPendingVersion(null);
      setVerOpen(false);
    }
  };

  const openLogs = async () => {
    setSpin(true);
    const r = await postJson<string[]>(panel(`api/server/logs/${logRows}`), {
      level: logLevel,
      syslog: logSys,
    });
    setSpin(false);
    if (r.success && r.obj) {
      setLogText((r.obj || []).join("\n"));
      setLogOpen(true);
    }
  };
  const openXrayLogs = async () => {
    setSpin(true);
    const r = await postJson<Record<string, unknown>[]>(panel(`api/server/xraylogs/${logRows}`), {
      filter: "",
      showDirect: true,
      showBlocked: true,
      showProxy: true,
      nodeId: xNode || undefined,
    });
    setSpin(false);
    if (r.success && r.obj) {
      setXlogHtml(xrayLogTable(r.obj as Record<string, unknown>[]));
      setXlogOpen(true);
    }
  };
  const openConfig = async () => {
    setSpin(true);
    const r = await getJson<unknown>(panel("api/server/getConfigJson"));
    setSpin(false);
    if (r.success) {
      setConfigText(JSON.stringify(r.obj, null, 2));
      setConfigOpen(true);
    }
  };
  const openCpu = () => {
    setCpuOpen(true);
  };
  const exportDb = () => {
    if (typeof window === "undefined") return;
    window.location.href = p("panel/api/server/getDb");
  };
  const importDb = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".sql";
    inp.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("db", f);
      setBackupOpen(false);
      setSpin(true);
      const u = await api.post<{ success: boolean; msg: string }>(panel("api/server/importDB"), fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setSpin(false);
      if (u.data.success) {
        setSpin(true);
        await postJson(panel("setting/restartPanel"));
        setTimeout(() => window.location.reload(), 5000);
      } else {
        toast.error(u.data.msg);
      }
    };
    inp.click();
  };

  return (
    <PageScaffold>
      <PageHeader title={t("menu.dashboard")} accentTitle icon={LayoutDashboard} iconTone="accent" />

      {spin && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--bg)]/40 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-8 py-6 shadow-2xl">
            <Spinner size={36} />
            <span className="text-sm text-[var(--fg-muted)]">{t("loading")}</span>
          </div>
        </div>
      )}

        {showSec && (
          <AlertBanner
            type="error"
            title={t("secAlertTitle")}
            onClose={() => {
              if (dontSec) localStorage.setItem("hideSecAlert", "true");
              setShowSec(false);
            }}
            description={
              <div>
                {t("secAlertSsl")}
                <div className="mt-3">
                  <CheckboxField
                    label={t("dontShowAgain")}
                    checked={dontSec}
                    onChange={(e) => setDontSec(e.target.checked)}
                  />
                </div>
              </div>
            }
            className="mb-4"
          />
        )}

        <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-12" staggerChildren={0.06}>
          <StaggerItem className="lg:col-span-4">
            <Surface>
              <div className="mb-4 flex items-center justify-center gap-2.5">
                <IconTile icon={Activity} tone="accent" size="sm" />
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {t("pages.index.systemLoad")} · resources
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm text-[var(--fg-muted)]">
                <div>
                  <LinearProgress percent={cpuP} strokeColor={metricColor(cpuP, accent)} />
                  <p className="mt-1 text-center text-xs">
                    <span className="text-[var(--fg)]">CPU</span> {st.cpuCores} cores · {toFixed(cpuP, 0)}%
                  </p>
                </div>
                <div>
                  <LinearProgress percent={memP} strokeColor={metricColor(memP, accent)} />
                  <p className="mt-1 text-center text-xs">
                    {t("pages.index.memory")} · {toFixed(memP, 0)}%
                  </p>
                  <p className="text-center text-[10px] opacity-80">
                    {sizeFormat(st.mem.current)} / {sizeFormat(st.mem.total)}
                  </p>
                </div>
                <div>
                  <LinearProgress percent={swP} strokeColor={metricColor(swP, accent)} />
                  <p className="mt-1 text-center text-xs">Swap · {toFixed(swP, 0)}%</p>
                </div>
                <div>
                  <LinearProgress percent={dskP} strokeColor={metricColor(dskP, accent)} />
                  <p className="mt-1 text-center text-xs">{t("pages.index.storage")} · {toFixed(dskP, 0)}%</p>
                </div>
              </div>
              {multi && nTot > 0 && (
                <div className="mt-4 border-t border-[var(--border)] pt-4 text-center text-sm text-[var(--fg-muted)]">
                  <LinearProgress
                    percent={nP}
                    strokeColor={metricColor(100 - nP, accent)}
                  />
                  <p className="mt-1">
                    {t("pages.index.nodesAvailability")} {nOn} / {nTot}
                  </p>
                </div>
              )}
            </Surface>
          </StaggerItem>
          <StaggerItem className="lg:col-span-8">
            <Surface>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconTile icon={Wrench} tone="warning" size="sm" />
                  <h2 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.xrayStatus")}</h2>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${xrayTagClass(
                    xUi.color
                  )}`}
                >
                  {xUi.msg}
                </span>
              </div>
              <p className="text-sm text-[var(--fg-muted)]">
                v{st.xray?.version || "—"} {st.xray?.errorMsg ? `— ${st.xray.errorMsg}` : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-end gap-0.5 border-t border-[var(--border)] pt-3">
                <IconButton label={t("pages.index.logs")} onClick={openXrayLogs}>
                  <History size={16} />
                </IconButton>
                <IconButton label={t("pages.index.stopXray")} onClick={stopX}>
                  <Power size={16} />
                </IconButton>
                <IconButton label={t("pages.index.restartXray")} onClick={restartX}>
                  <RefreshCw size={16} />
                </IconButton>
                <IconButton label={t("pages.index.xraySwitch")} onClick={openVer}>
                  <Wrench size={16} />
                </IconButton>
              </div>
            </Surface>
          </StaggerItem>
        </Stagger>

        <Reveal className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Surface>
            <div className="flex items-center gap-2">
              <IconTile icon={Link2} tone="info" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("menu.link")}</h3>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-0.5 border-t border-[var(--border)] pt-3">
              <IconButton label={t("pages.index.logs")} onClick={openLogs}>
                <History size={16} />
              </IconButton>
              <IconButton label={t("pages.index.config")} onClick={openConfig}>
                <SlidersHorizontal size={16} />
              </IconButton>
              <IconButton label={t("pages.index.backup")} onClick={() => setBackupOpen(true)}>
                <Server size={16} />
              </IconButton>
            </div>
          </Surface>
          <Surface>
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Clock} tone="success" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.operationHours")}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <PillTag tone="green">Xray: {formatSecond(st.appStats?.uptime || 0)}</PillTag>
              <PillTag tone="blue">OS: {formatSecond(st.uptime)}</PillTag>
            </div>
          </Surface>
          <Surface>
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Activity} tone="accent" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.systemLoad")}</h3>
            </div>
            <PillTag>{st.loads?.map((l) => toFixed(l, 2)).join(" | ")}</PillTag>
          </Surface>
        </Reveal>

        <Stagger className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" staggerChildren={0.04}>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title={t("pages.index.upload")}
                value={<CountSize value={st.netIO.up} />}
                prefix={<ArrowUp size={16} className="text-[var(--accent)]" />}
                suffix="/s"
              />
            </Surface>
          </StaggerItem>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title={t("pages.index.download")}
                value={<CountSize value={st.netIO.down} />}
                prefix={<ArrowDown size={16} className="text-[var(--accent)]" />}
                suffix="/s"
              />
            </Surface>
          </StaggerItem>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title={t("pages.index.sent")}
                value={<CountSize value={st.netTraffic.sent} />}
                prefix={<CloudUpload size={16} className="text-[var(--accent)]" />}
              />
            </Surface>
          </StaggerItem>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title={t("pages.index.received")}
                value={<CountSize value={st.netTraffic.recv} />}
                prefix={<CloudDownload size={16} className="text-[var(--accent)]" />}
              />
            </Surface>
          </StaggerItem>
        </Stagger>

        <Reveal className="mt-4">
          <Surface>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <IconTile icon={Globe} tone="info" size="sm" />
                <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.ipAddresses")}</h3>
              </div>
              <IconButton label="Toggle IP" onClick={() => setShowIp((v) => !v)}>
                <Globe size={16} />
              </IconButton>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatBlock title="IPv4" value={showIp ? st.publicIP?.ipv4 : "****"} />
              <StatBlock title="IPv6" value={showIp ? st.publicIP?.ipv6 : "****"} />
            </div>
          </Surface>
        </Reveal>

        <Stagger className="mt-4 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2" staggerChildren={0.05}>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title="TCP"
                value={<CountNumber value={st.tcpCount} />}
                prefix={<ArrowLeftRight size={16} className="text-[var(--accent)]" />}
              />
            </Surface>
          </StaggerItem>
          <StaggerItem>
            <Surface padding="sm">
              <StatBlock
                title="UDP"
                value={<CountNumber value={st.udpCount} />}
                prefix={<ArrowLeftRight size={16} className="text-[var(--accent)]" />}
              />
            </Surface>
          </StaggerItem>
        </Stagger>

        <div className="mt-6">
          <Button variant="primary" onClick={openCpu}>
            CPU history
          </Button>
        </div>

      <Modal open={verOpen} onClose={() => setVerOpen(false)} title={t("pages.index.xraySwitch")} width={640}>
        <ul className="list-none space-y-1">
          {verList.map((v) => (
            <li key={v}>
              <button
                type="button"
                className="text-left text-sm font-medium text-[var(--accent)] hover:underline"
                onClick={() => {
                  setPendingVersion(v);
                  setVerOpen(false);
                }}
              >
                {v}
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <Modal open={logOpen} onClose={() => setLogOpen(false)} title={t("pages.index.logs")} width={800}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SelectNative
            className="w-24"
            value={String(logRows)}
            onChange={(e) => setLogRows(Number(e.target.value))}
          >
            {[10, 20, 50, 100, 500].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </SelectNative>
          <SelectNative
            className="w-36"
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
          >
            {["debug", "info", "notice", "warning", "err"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </SelectNative>
          <CheckboxField label="SysLog" checked={logSys} onChange={(e) => setLogSys(e.target.checked)} />
          <Button
            variant="secondary"
            onClick={async () => {
              setSpin(true);
              const r = await postJson<string[]>(panel(`api/server/logs/${logRows}`), {
                level: logLevel,
                syslog: logSys,
              });
              setSpin(false);
              if (r.success && r.obj) setLogText((r.obj || []).join("\n"));
            }}
          >
            {t("refresh")}
          </Button>
        </div>
        <pre className="mt-2 max-h-[400px] overflow-auto whitespace-pre-wrap text-xs text-[var(--fg-muted)]">
          {logText}
        </pre>
      </Modal>

      <Modal open={xlogOpen} onClose={() => setXlogOpen(false)} title="Xray logs" width="80vw">
        {multi && (
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-subtle)]">Node</label>
              <SelectNative
                className="min-w-[200px]"
                value={xNode}
                onChange={(e) => setXNode(e.target.value)}
              >
                <option value="">—</option>
                {nodes.map((n) => (
                  <option key={n.id} value={String(n.id)}>
                    {n.name}
                  </option>
                ))}
              </SelectNative>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                setSpin(true);
                const r = await postJson<Record<string, unknown>[]>(panel(`api/server/xraylogs/${logRows}`), {
                  filter: "",
                  showDirect: true,
                  showBlocked: true,
                  showProxy: true,
                  nodeId: xNode || undefined,
                });
                setSpin(false);
                if (r.success && r.obj) {
                  setXlogHtml(xrayLogTable(r.obj as Record<string, unknown>[]));
                }
              }}
            >
              {t("refresh")}
            </Button>
          </div>
        )}
        <div
          className="xlog-html max-h-[70vh] overflow-auto text-sm"
          dangerouslySetInnerHTML={{ __html: xlogHtml }}
        />
      </Modal>

      <Modal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        title={t("pages.index.backupTitle")}
      >
        <ul className="list-none space-y-3">
          <li>
            <Button variant="primary" className="!gap-2" onClick={exportDb}>
              <CloudDownload size={16} />
              {t("pages.index.exportDatabase")}
            </Button>
          </li>
          <li>
            <Button variant="primary" className="!gap-2" onClick={importDb}>
              <Server size={16} />
              {t("pages.index.importDatabase")}
            </Button>
          </li>
        </ul>
      </Modal>

      <Modal open={configOpen} onClose={() => setConfigOpen(false)} title="config.json" width={800}>
        <pre className="max-h-[500px] overflow-auto text-xs text-[var(--fg-muted)]">{configText}</pre>
      </Modal>

      <Modal open={cpuOpen} onClose={() => setCpuOpen(false)} title="CPU History" width={900}>
        <SelectNative
          className="mb-3 w-full sm:w-48"
          value={String(cpuBucket)}
          onChange={async (e) => {
            const v = Number(e.target.value);
            setCpuBucket(v);
            setSpin(true);
            const r = await getJson<{ t: number; cpu: number }[]>(panel(`api/server/cpuHistory/${v}`));
            setSpin(false);
            if (r.success && r.obj) {
              setCpuLong(
                r.obj.map((p0) => Math.max(0, Math.min(100, p0.cpu)))
              );
            }
          }}
        >
          {[
            { value: 2, label: "2m" },
            { value: 30, label: "30m" },
            { value: 60, label: "1h" },
            { value: 120, label: "2h" },
            { value: 180, label: "3h" },
            { value: 300, label: "5h" },
          ].map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SelectNative>
        <div className="h-[220px] w-full">
          <svg
            viewBox="0 0 840 220"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            className="text-[var(--accent)]"
          >
            <polyline
              fill="none"
              stroke={accent}
              strokeWidth="2"
              points={cpuLong
                .map((y, i, a) => {
                  const n = a.length;
                  if (!n) return "";
                  const x = 40 + (i / (n - 1 || 1)) * 760;
                  const yy = 200 - (y / 100) * 180;
                  return `${x},${yy}`;
                })
                .join(" ")}
            />
          </svg>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingVersion != null}
        title={t("pages.index.xraySwitchVersionDialog")}
        description={
          pendingVersion
            ? t("pages.index.xraySwitchVersionDialogDesc").replace("#version#", pendingVersion)
            : undefined
        }
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        onCancel={() => setPendingVersion(null)}
        onConfirm={runInstallVersion}
        loading={versionInstalling}
      />
    </PageScaffold>
  );
}

function xrayLogTable(logs: Record<string, unknown>[]) {
  if (!logs.length) return "<p>No data</p>";
  let h =
    "<table class=\"w-full border-collapse text-sm\"><tr><th class=\"border border-[var(--border)] p-2 text-left\">Date</th><th class=\"border border-[var(--border)] p-2\">From</th><th class=\"border border-[var(--border)] p-2\">To</th><th class=\"border border-[var(--border)] p-2\">Inbound</th><th class=\"border border-[var(--border)] p-2\">Outbound</th><th class=\"border border-[var(--border)] p-2\">Email</th></tr>";
  for (const log of logs.slice().reverse()) {
    const e = (log.Event as number) || 0;
    const c = e === 1 ? ' style="color:#e04141"' : e === 2 ? ' style="color:#3c89e8"' : "";
    h += `<tr${c}><td class="border border-[var(--border)] p-2">${String(log.DateTime ?? "")}</td><td class="border border-[var(--border)] p-2">${String(
      log.FromAddress ?? ""
    )}</td><td class="border border-[var(--border)] p-2">${String(
      log.ToAddress ?? ""
    )}</td><td class="border border-[var(--border)] p-2">${String(log.Inbound ?? "")}</td><td class="border border-[var(--border)] p-2">${String(
      log.Outbound ?? ""
    )}</td><td class="border border-[var(--border)] p-2">${String(log.Email ?? "")}</td></tr>`;
  }
  h += "</table>";
  return h;
}
