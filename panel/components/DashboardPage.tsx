"use client";

import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Clock,
  CloudDownload,
  CloudUpload,
  Cpu,
  Database,
  Globe,
  History,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  Network,
  Power,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson, api } from "@/lib/api";
import { formatSecond, sizeFormat, toFixed } from "@/lib/format";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { linkP, panel, p } from "@/lib/paths";
import { usePanelAccentColor } from "@/lib/panelTheme";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  AlertBanner,
  Button,
  CheckboxField,
  ConfirmDialog,
  IconButton,
  IconTile,
  Input,
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
import {
  DASHBOARD_WIDGET_I18N,
  DASHBOARD_WIDGET_ORDER,
  type DashboardWidgetId,
  loadDashboardWidgets,
  saveDashboardWidgets,
  toggleDashboardWidget,
} from "@/lib/dashboardLayout";

type StatusData = {
  cpu: number;
  cpuCores: number;
  logicalPro?: number;
  cpuSpeedMhz?: number;
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
  panelUptime: number;
  panelVersion?: string;
  xray: { state: string; errorMsg: string; version: string };
  nodes?: { online: number; total: number };
  nodesXray?: { total: number; running: number; stopped: number; error: number; unknown: number };
  database: {
    size: number;
    tables: number;
    totalRows: number;
    openConns: number;
    idleConns: number;
    maxOpenConns: number;
    maxIdleConns: number;
  };
  usersOnline?: number;
};

type UnifiedLogEntry = {
  source: "panel" | "xray" | "node";
  channel?: string;
  level: string;
  message: string;
  ts: number;
  nodeId?: number | string;
  nodeName?: string;
};

type IncomingUnifiedLogEntry = Partial<UnifiedLogEntry> & {
  msg?: string;
  tsUnixMs?: number;
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
  tr: (k: string) => string,
  opts?: { multiMode?: boolean }
): { msg: string; color: string } {
  if (state === "running")
    return { msg: tr("pages.index.xrayStatusRunning"), color: "green" };
  if (state === "stop") {
    if (opts?.multiMode) {
      return { msg: tr("pages.index.xrayLocalNotRunningMulti"), color: "info" };
    }
    return { msg: tr("pages.index.xrayStatusStop"), color: "orange" };
  }
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
    case "info":
      return "border-sky-500/35 bg-sky-500/10 text-sky-100";
    default:
      return "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)]";
  }
}

const SPARK_W = 200;
const SPARK_H = 36;
const HISTORY_W = 840;
const HISTORY_H = 220;
const HISTORY_PAD_L = 40;
const HISTORY_PAD_R = 40;
const HISTORY_PAD_T = 20;
const HISTORY_PAD_B = 20;

type ResourceHistoryPoint = {
  value: number;
  ts: number;
};

type DashboardClientHwid = {
  userAgent?: string;
};

type DashboardClientRow = {
  hwids?: DashboardClientHwid[];
};

function toUnixMs(ts: number) {
  // API may return unix seconds for historical points.
  return ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
}

function ResourceSparkline({ data, stroke }: { data: number[]; stroke: string }) {
  if (data.length < 2) {
    return <div className="h-9 w-full rounded-md bg-[var(--border)]/20" aria-hidden />;
  }
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W;
      const y = SPARK_H - 1 - (Math.max(0, Math.min(100, v)) / 100) * (SPARK_H - 2);
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      className="h-9 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
        vectorEffect="non-scaling-stroke"
        opacity="0.92"
      />
    </svg>
  );
}

function ResourceHistoryChart({
  points,
  stroke,
  gradientId,
  hoverIndex,
  onHoverIndex,
  onLeave,
}: {
  points: ResourceHistoryPoint[];
  stroke: string;
  gradientId: string;
  hoverIndex: number | null;
  onHoverIndex: (idx: number | null) => void;
  onLeave: () => void;
}) {
  if (points.length < 2) {
    return <div className="h-[220px] w-full rounded-lg bg-[var(--border)]/20" aria-hidden />;
  }
  const innerW = HISTORY_W - HISTORY_PAD_L - HISTORY_PAD_R;
  const innerH = HISTORY_H - HISTORY_PAD_T - HISTORY_PAD_B;
  const stepX = innerW / Math.max(1, points.length - 1);
  const chartPoints = points.map((p0, i) => {
    const value = Math.max(0, Math.min(100, p0.value));
    const x = HISTORY_PAD_L + i * stepX;
    const y = HISTORY_H - HISTORY_PAD_B - (value / 100) * innerH;
    return { ...p0, value, x, y };
  });
  const linePoints = chartPoints.map((p0) => `${p0.x},${p0.y}`).join(" ");
  const areaPath = [
    `M ${chartPoints[0].x} ${HISTORY_H - HISTORY_PAD_B}`,
    ...chartPoints.map((p0) => `L ${p0.x} ${p0.y}`),
    `L ${chartPoints[chartPoints.length - 1].x} ${HISTORY_H - HISTORY_PAD_B}`,
    "Z",
  ].join(" ");
  const activePoint = hoverIndex != null ? chartPoints[hoverIndex] : null;

  return (
    <div className="relative h-[220px] w-full" onMouseLeave={onLeave}>
      <svg
        viewBox={`0 0 ${HISTORY_W} ${HISTORY_H}`}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * HISTORY_W;
          const idx = Math.round((relX - HISTORY_PAD_L) / stepX);
          onHoverIndex(Math.max(0, Math.min(chartPoints.length - 1, idx)));
        }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.45" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0, 25, 50, 75, 100].map((v) => {
          const y = HISTORY_H - HISTORY_PAD_B - (v / 100) * innerH;
          return (
            <line
              key={v}
              x1={HISTORY_PAD_L}
              y1={y}
              x2={HISTORY_W - HISTORY_PAD_R}
              y2={y}
              stroke="var(--border)"
              strokeOpacity="0.35"
              strokeDasharray="4 5"
            />
          );
        })}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={linePoints}
        />
        {chartPoints.map((p0, i) => (
          <circle
            key={`${p0.ts}-${i}`}
            cx={p0.x}
            cy={p0.y}
            r={hoverIndex === i ? 3.4 : 1.9}
            fill={stroke}
            opacity={hoverIndex === i ? 1 : 0.45}
          />
        ))}
        {activePoint ? (
          <>
            <line
              x1={activePoint.x}
              y1={HISTORY_PAD_T}
              x2={activePoint.x}
              y2={HISTORY_H - HISTORY_PAD_B}
              stroke={stroke}
              strokeOpacity="0.5"
              strokeDasharray="4 5"
            />
            <circle cx={activePoint.x} cy={activePoint.y} r={4.5} fill={stroke} />
          </>
        ) : null}
      </svg>
      {activePoint ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/95 px-2 py-1 text-xs shadow-lg backdrop-blur">
          <p className="font-medium text-[var(--fg)]">{toFixed(activePoint.value, 1)}%</p>
          <p className="text-[var(--fg-muted)]">{new Date(activePoint.ts).toLocaleString()}</p>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const accent = usePanelAccentColor();
  const [loading, setLoading] = useState(true);
  const [spin, setSpin] = useState(false);
  const [st, setSt] = useState<StatusData | null>(null);
  const [showSec, setShowSec] = useState(false);
  const [dontSec, setDontSec] = useState(false);
  const [showIp, setShowIp] = useState(false);
  const [multi, setMulti] = useState(false);
  const [ipv6Enabled, setIpv6Enabled] = useState(false);
  const [verOpen, setVerOpen] = useState(false);
  const [verList, setVerList] = useState<string[]>([]);
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  const [versionInstalling, setVersionInstalling] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configText, setConfigText] = useState("");
  const [cpuOpen, setCpuOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [logLevel, setLogLevel] = useState("info");
  const [logSource, setLogSource] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [logAuto, setLogAuto] = useState(true);
  const [logEntries, setLogEntries] = useState<UnifiedLogEntry[]>([]);
  const logsBodyRef = useRef<HTMLDivElement | null>(null);
  const [cpuBucket, setCpuBucket] = useState(2);
  const [cpuLong, setCpuLong] = useState<ResourceHistoryPoint[]>([]);
  /** Last points for dashboard sparklines (CPU from API, RAM from status samples). */
  const [cpuPreview, setCpuPreview] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<ResourceHistoryPoint[]>([]);
  const [cpuHoverIndex, setCpuHoverIndex] = useState<number | null>(null);
  const [memHoverIndex, setMemHoverIndex] = useState<number | null>(null);
  const [nodes, setNodes] = useState<{ id: number; name: string }[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [enabledWidgets, setEnabledWidgets] = useState<DashboardWidgetId[]>(() => loadDashboardWidgets());
  const [dashboardHwidUserAgentStats, setDashboardHwidUserAgentStats] = useState<
    { label: string; count: number; percentRaw: number; percentLabel: string }[]
  >([]);

  const ws = usePanelWebSocket();

  const normalizeLogEntry = useCallback((raw: unknown): UnifiedLogEntry | null => {
    if (!raw || typeof raw !== "object") return null;
    const entry = raw as IncomingUnifiedLogEntry;
    const message = String(entry.message ?? entry.msg ?? "").trim();
    if (!message) return null;
    const sourceRaw = String(entry.source ?? "panel").toLowerCase();
    const source: UnifiedLogEntry["source"] =
      sourceRaw === "xray" || sourceRaw === "node" ? sourceRaw : "panel";
    const ts = Number(entry.tsUnixMs ?? entry.ts ?? Date.now());
    return {
      source,
      channel: entry.channel ? String(entry.channel) : undefined,
      level: String(entry.level ?? "info").toLowerCase(),
      message,
      ts: Number.isFinite(ts) ? ts : Date.now(),
      nodeId: entry.nodeId,
      nodeName: entry.nodeName ? String(entry.nodeName) : undefined,
    };
  }, []);

  useEffect(() => {
    saveDashboardWidgets(enabledWidgets);
  }, [enabledWidgets]);

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

  const pullDashboardHwidUserAgentStats = useCallback(async () => {
    const unknownLabel = t("pages.clients.hwidUserAgentUnknown", {
      defaultValue: "Unknown",
    });
    const r = await getJson<DashboardClientRow[]>(panel("client/list"));
    if (!r.success || !r.obj) {
      setDashboardHwidUserAgentStats([]);
      return;
    }
    const byUserAgent = new Map<string, number>();
    let total = 0;
    for (const client of r.obj) {
      const hwids = Array.isArray(client.hwids) ? client.hwids : [];
      for (const hwidRow of hwids) {
        const label = hwidRow.userAgent?.trim() ? hwidRow.userAgent.trim() : unknownLabel;
        byUserAgent.set(label, (byUserAgent.get(label) ?? 0) + 1);
        total += 1;
      }
    }
    const stats = Array.from(byUserAgent.entries())
      .map(([label, count]) => {
        const percentRaw = total > 0 ? (count / total) * 100 : 0;
        const percentRounded = Math.round(percentRaw * 10) / 10;
        const percentLabel = `${Number.isInteger(percentRounded) ? percentRounded.toFixed(0) : percentRounded.toFixed(1)}%`;
        return { label, count, percentRaw, percentLabel };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    setDashboardHwidUserAgentStats(stats);
  }, [t]);

  useEffect(() => {
    (async () => {
      try {
        await postJson(panel("setting/defaultSettings"));
        const s = await postJson<Record<string, unknown>>(panel("setting/all"));
        if (s.success && s.obj) {
          const settings = s.obj as { multiNodeMode?: boolean; enableIPv6?: boolean };
          setMulti(Boolean(settings.multiNodeMode));
          setIpv6Enabled(Boolean(settings.enableIPv6));
        }
      } catch {
        /* ignore */
      }
      await pull();
      await pullDashboardHwidUserAgentStats();
      setLoading(false);
    })();
  }, [pull, pullDashboardHwidUserAgentStats]);

  useEffect(() => {
    if (!ws) return;
    const onStatus = (payload: unknown) => {
      setSt(payload as StatusData);
    };
    const onXray = (payload: unknown) => {
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
    };
    const onLog = (payload: unknown) => {
      const entry = normalizeLogEntry(payload);
      if (!entry) return;
      setLogEntries((prev) => [entry, ...prev]);
    };
    ws.on("status", onStatus);
    ws.on("xray_state", onXray);
    ws.on("logs_stream", onLog);
    return () => {
      ws.off("status", onStatus);
      ws.off("xray_state", onXray);
      ws.off("logs_stream", onLog);
    };
  }, [ws, normalizeLogEntry]);

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
    const load = async () => {
      const r = await getJson<{ t: number; cpu: number }[]>(panel("api/server/cpuHistory/2"));
      if (r.success && r.obj) {
        setCpuPreview(
          r.obj.map((p0) => Math.max(0, Math.min(100, p0.cpu))).slice(-48)
        );
      }
    };
    load();
    const id = window.setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!cpuOpen) return;
    (async () => {
      setSpin(true);
      const r = await getJson<{ t: number; cpu: number }[]>(panel(`api/server/cpuHistory/${cpuBucket}`));
      setSpin(false);
      if (r.success && r.obj) {
        setCpuLong(
          r.obj.map((p0) => ({
            value: Math.max(0, Math.min(100, p0.cpu)),
            ts: toUnixMs(Number(p0.t || Date.now())),
          }))
        );
      }
    })();
  }, [cpuOpen, cpuBucket]);

  const memCurrent = st?.mem.current;
  const memTotal = st?.mem.total;

  useEffect(() => {
    if (memCurrent == null || memTotal == null) return;
    setMemHistory((prev) => [...prev, { value: pct(memCurrent, memTotal), ts: Date.now() }].slice(-120));
  }, [memCurrent, memTotal]);

  useEffect(() => {
    if (!logsOpen || !logAuto) return;
    const el = logsBodyRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [logsOpen, logAuto, logEntries.length, logSearch, logSource]);

  const dashboardHwidUserAgentPie = useMemo(() => {
    const palette = [
      "#3b82f6",
      "#8b5cf6",
      "#14b8a6",
      "#f59e0b",
      "#ef4444",
      "#10b981",
      "#06b6d4",
      "#a855f7",
      "#f97316",
      "#84cc16",
    ];
    let current = 0;
    const parts = dashboardHwidUserAgentStats.map((item, index) => {
      const start = current;
      current += item.percentRaw;
      return {
        ...item,
        color: palette[index % palette.length],
        start,
        end: current,
      };
    });
    const gradient =
      parts.length > 0
        ? `conic-gradient(${parts
            .map((part) => `${part.color} ${part.start}% ${part.end}%`)
            .join(", ")})`
        : "conic-gradient(var(--border) 0% 100%)";
    return { parts, gradient };
  }, [dashboardHwidUserAgentStats]);

  if (loading) {
    return (
      <PageScaffold>
        <PageHeader
          title={t("menu.dashboard")}
          accentTitle
          icon={LayoutDashboard}
          iconTone="accent"
          actions={
            <Button type="button" variant="secondary" className="!gap-2" disabled>
              <LayoutGrid size={16} />
              {t("pages.index.dashboardCustomize")}
            </Button>
          }
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12" aria-hidden>
          <div className="h-72 animate-pulse rounded-2xl bg-[var(--surface)]/60 lg:col-span-8" />
          <div className="h-72 animate-pulse rounded-2xl bg-[var(--surface)]/50 lg:col-span-4" />
        </div>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-[var(--border)]/30 bg-[var(--surface)]/40"
            />
          ))}
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
  const xUi = xrayStateMsg(st.xray.state, t, { multiMode: multi });
  const nx = st.nodesXray;
  const trafficMax = Math.max(1, st.netIO.up, st.netIO.down, st.netTraffic.sent, st.netTraffic.recv);
  const ramSparkColor = "#a78bfa";
  const showResources = enabledWidgets.includes("resources");
  const showXray = enabledWidgets.includes("xray");
  const showQuickActions = enabledWidgets.includes("quick_actions");
  const showUptime = enabledWidgets.includes("uptime");
  const showDatabase = enabledWidgets.includes("database");
  const showNetwork = enabledWidgets.includes("network");
  const showPanelRuntime = enabledWidgets.includes("panel_runtime");
  const showUsersOnline = enabledWidgets.includes("users_online");
  const showUserAgent = enabledWidgets.includes("user_agent");
  const cpuGhz = st.cpuSpeedMhz
    ? st.cpuSpeedMhz >= 1000
      ? `${toFixed(st.cpuSpeedMhz / 1000, 2)} GHz`
      : `${toFixed(st.cpuSpeedMhz, 0)} MHz`
    : "—";
  const levelRank = (lvl: string) => {
    const k = String(lvl || "").toLowerCase();
    if (k.startsWith("err") || k === "error") return 40;
    if (k.startsWith("warn") || k === "warning") return 30;
    if (k === "notice") return 25;
    if (k === "info") return 20;
    if (k === "debug") return 10;
    return 0;
  };
  const levelBadgeClass = (lvl: string) => {
    const k = String(lvl || "").toLowerCase();
    if (k.startsWith("err") || k === "error") {
      return "border-red-500/40 bg-red-500/10 text-red-300";
    }
    if (k.startsWith("warn") || k === "warning") {
      return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    }
    if (k === "info" || k === "notice") {
      return "border-sky-500/40 bg-sky-500/10 text-sky-200";
    }
    if (k === "debug") {
      return "border-violet-500/35 bg-violet-500/10 text-violet-200";
    }
    return "border-[var(--border)] bg-[var(--surface)] text-[var(--fg-muted)]";
  };
  const filteredLogs = logEntries.filter((row) => {
    if (logSource !== "all" && row.source !== logSource) return false;
    // Display filter: show selected level and above (e.g. info => info+notice+warning+error).
    if (logLevel !== "all" && levelRank(row.level) < levelRank(logLevel)) return false;
    if (!logSearch.trim()) return true;
    const q = logSearch.toLowerCase();
    return (
      row.message.toLowerCase().includes(q) ||
      row.level.toLowerCase().includes(q) ||
      (row.nodeName || "").toLowerCase().includes(q)
    );
  }).sort((a, b) => b.ts - a.ts);
  const visibleLogs = filteredLogs;

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
    // Always open logs modal in "info and above" mode.
    setLogLevel("info");
    setSpin(true);
    try {
      // 0 = full available history from backend storage.
      const r = await getJson<unknown[]>(panel("api/server/logs/unified/0"));
      if (r.success) {
        const rows = Array.isArray(r.obj)
          ? r.obj.map((x) => normalizeLogEntry(x)).filter((x): x is UnifiedLogEntry => Boolean(x))
          : [];
        setLogEntries(rows.sort((a, b) => b.ts - a.ts));
        setLogsOpen(true);
      } else {
        toast.error(r.msg || t("fail"));
      }
    } catch {
      toast.error(t("fail"));
    } finally {
      setSpin(false);
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
  const openMem = () => {
    setMemOpen(true);
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
      <PageHeader
        title={t("menu.dashboard")}
        accentTitle
        icon={LayoutDashboard}
        iconTone="accent"
        actions={
          <Button type="button" variant="secondary" onClick={() => setCustomizeOpen(true)} className="!gap-2">
            <LayoutGrid size={16} />
            {t("pages.index.dashboardCustomize")}
          </Button>
        }
      />

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

        {(showResources || showXray) && (
        <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-12" staggerChildren={0.06}>
          {showResources && (
          <StaggerItem className={showXray ? "lg:col-span-8" : "lg:col-span-12"}>
            <Surface>
              <div className="mb-3 flex items-center justify-center gap-2.5">
                <IconTile icon={Activity} tone="accent" size="sm" />
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {t("pages.index.systemLoad")} · {t("pages.index.resources")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-[var(--fg-muted)]">
                <button
                  type="button"
                  onClick={openCpu}
                  title={t("pages.index.cpuHistory")}
                  className="group rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/50 p-2.5 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                >
                  <LinearProgress percent={cpuP} strokeColor={metricColor(cpuP, accent)} />
                  <p className="mt-1.5 text-center text-xs">
                    <span className="text-[var(--fg)]">{t("pages.index.cpu")}</span>{" "}
                    {st.cpuCores} {t("pages.index.cores")} · {toFixed(cpuP, 0)}%
                  </p>
                  <div className="mt-2 opacity-90 transition group-hover:opacity-100">
                    <ResourceSparkline data={cpuPreview} stroke={accent} />
                  </div>
                </button>
                <button
                  type="button"
                  onClick={openMem}
                  title={t("pages.index.memoryHistory")}
                  className="group rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/50 p-2.5 text-left transition hover:border-[var(--accent)]/40 hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
                >
                  <LinearProgress percent={memP} strokeColor={metricColor(memP, accent)} />
                  <p className="mt-1.5 text-center text-xs">
                    {t("pages.index.memory")} · {toFixed(memP, 0)}%
                  </p>
                  <p className="text-center text-[10px] opacity-80">
                    {sizeFormat(st.mem.current)} / {sizeFormat(st.mem.total)}
                  </p>
                  <div className="mt-1 opacity-90 transition group-hover:opacity-100">
                    <ResourceSparkline data={memHistory.map((p0) => p0.value)} stroke={ramSparkColor} />
                  </div>
                </button>
                <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/50 p-2.5 text-left">
                  <LinearProgress percent={swP} strokeColor={metricColor(swP, accent)} />
                  <p className="mt-1.5 text-center text-xs">
                    {t("pages.index.swap")} · {toFixed(swP, 0)}%
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--border)]/80 bg-[var(--bg-elevated)]/50 p-2.5 text-left">
                  <LinearProgress percent={dskP} strokeColor={metricColor(dskP, accent)} />
                  <p className="mt-1.5 text-center text-xs">
                    {t("pages.index.storage")} · {toFixed(dskP, 0)}%
                  </p>
                </div>
              </div>
              {multi && nTot > 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-3 text-center text-sm text-[var(--fg-muted)]">
                  <LinearProgress
                    percent={nP}
                    strokeColor={metricColor(100 - nP, accent)}
                  />
                  <p className="mt-1">
                    {t("pages.index.nodesAvailability")} {nOn} / {nTot}
                  </p>
                </div>
              )}
              <div className="mt-3 border-t border-[var(--border)] pt-3 text-center text-xs text-[var(--fg-muted)]">
                <p className="font-medium text-[var(--fg-subtle)]">{t("pages.index.systemLoad")}</p>
                <p className="mt-1 font-mono text-[var(--fg)]">
                  {st.loads?.map((l) => toFixed(l, 2)).join(" · ")}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--fg-subtle)]">{t("pages.index.systemLoadDesc")}</p>
              </div>
            </Surface>
          </StaggerItem>
          )}
          {showXray && (
          <StaggerItem className={showResources ? "lg:col-span-4" : "lg:col-span-12"}>
            <Surface padding="sm" className="h-full">
              <div className="flex flex-wrap items-start justify-between gap-1.5">
                <div className="min-w-0 flex items-center gap-1.5">
                  <IconTile icon={Wrench} tone="warning" size="sm" className="shrink-0" />
                  <h2 className="truncate text-xs font-semibold text-[var(--fg)] sm:text-sm">
                    {multi ? t("pages.index.xrayPanelAndNodes") : t("pages.index.xrayStatus")}
                  </h2>
                </div>
                <span
                  className={`shrink-0 max-w-[min(100%,11rem)] truncate rounded-full border px-2 py-0.5 text-[10px] font-medium sm:text-xs ${xrayTagClass(
                    xUi.color
                  )}`}
                  title={multi ? `${t("pages.index.xrayLocalLabel")}: ${xUi.msg}` : xUi.msg}
                >
                  {multi ? `${t("pages.index.xrayLocalLabel")}: ${xUi.msg}` : xUi.msg}
                </span>
              </div>
              {multi && nx && nx.total > 0 && (
                <div className="mt-2 rounded-md border border-[var(--border)] bg-[var(--surface)]/60 px-2 py-1.5 text-[11px] leading-snug text-[var(--fg)] sm:text-xs">
                  <p>
                    {t("pages.index.nodesCoresSummary", {
                      running: nx.running,
                      total: nx.total,
                    })}
                    {(nx.error > 0 || nx.stopped > 0) && (
                      <span className="text-[var(--fg-muted)]">
                        {" "}
                        (
                        {nx.error > 0
                          ? t("pages.index.nodesCoresErrorCount", { n: nx.error })
                          : ""}
                        {nx.error > 0 && nx.stopped > 0 ? " · " : ""}
                        {nx.stopped > 0
                          ? t("pages.index.nodesCoresStoppedCount", { n: nx.stopped })
                          : ""}
                        )
                      </span>
                    )}
                  </p>
                  <Link
                    href={linkP("panel/nodes")}
                    className="mt-0.5 inline-block text-[10px] font-medium text-[var(--accent)] hover:underline sm:text-xs"
                  >
                    {t("pages.index.openNodes")} →
                  </Link>
                </div>
              )}
              {multi && (!nx || nx.total === 0) && nTot > 0 && (
                <p className="mt-1.5 text-[10px] text-[var(--fg-muted)] sm:text-xs">
                  {t("pages.index.nodesCoresNoEnabled")}
                </p>
              )}
              <p className="mt-2 line-clamp-2 text-[10px] text-[var(--fg-muted)] sm:text-xs" title={st.xray?.errorMsg}>
                {t("pages.index.xrayVersionLine", {
                  version: st.xray?.version || "—",
                })}
                {st.xray?.errorMsg ? ` — ${st.xray.errorMsg}` : ""}
              </p>
              <div className="mt-2.5 flex flex-wrap justify-end gap-0 border-t border-[var(--border)]/80 pt-2">
                <IconButton label={t("pages.index.stopXray")} onClick={stopX}>
                  <Power size={14} />
                </IconButton>
                <IconButton label={t("pages.index.restartXray")} onClick={restartX}>
                  <RefreshCw size={14} />
                </IconButton>
                <IconButton label={t("pages.index.xraySwitch")} onClick={openVer}>
                  <Wrench size={14} />
                </IconButton>
              </div>
            </Surface>
          </StaggerItem>
          )}
        </Stagger>
        )}

        {(showQuickActions || showUptime) && (
        <Reveal className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {showQuickActions && (
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
          )}
          {showUptime && (
          <Surface>
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Clock} tone="success" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.operationHours")}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <PillTag tone="blue">
                {t("pages.index.panelUptimeLabel")}: {formatSecond(st.panelUptime ?? 0)}
              </PillTag>
              <PillTag tone="blue">
                {t("pages.index.osLabel")}: {formatSecond(st.uptime)}
              </PillTag>
              {!multi && (
                <PillTag tone="green">
                  {t("pages.index.xrayUptimeLabel")}: {formatSecond(st.appStats?.uptime || 0)}
                </PillTag>
              )}
              {multi && nx && nx.total > 0 && (
                <PillTag tone="green">
                  {t("pages.index.nodesCoresRunningPill", { running: nx.running, total: nx.total })}
                </PillTag>
              )}
            </div>
          </Surface>
          )}
        </Reveal>
        )}

        {showUsersOnline && (
        <Reveal className="mt-4">
          <Surface>
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Users} tone="success" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.usersOnline")}</h3>
            </div>
            <p className="mb-3 text-xs text-[var(--fg-muted)]">{t("pages.index.usersOnlineHint")}</p>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <StatBlock
                title={t("pages.index.usersOnline")}
                value={<CountNumber value={st.usersOnline ?? 0} />}
                prefix={<Users size={16} className="text-emerald-400/90" />}
              />
              <Link
                href={linkP("panel/clients/statistics")}
                className="shrink-0 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                {t("pages.index.openClientStats")} →
              </Link>
            </div>
          </Surface>
        </Reveal>
        )}

        {showUserAgent && (
        <Reveal className="mt-4">
          <Surface>
            <div className="mb-2 flex items-center gap-2">
              <IconTile icon={Users} tone="info" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">
                {t("pages.clients.hwidUserAgentShareTitle", {
                  defaultValue: "User-Agent distribution by HWID",
                })}
              </h3>
            </div>
            <p className="mb-3 text-xs text-[var(--fg-muted)]">
              {t("pages.index.hwidUserAgentDashboardHint", {
                defaultValue: "Overall share of registered devices across all clients.",
              })}
            </p>
            {dashboardHwidUserAgentPie.parts.length === 0 ? (
              <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[auto,1fr] sm:items-start">
                <div className="mx-auto w-fit">
                  <div
                    className="relative h-40 w-40 rounded-full border border-[var(--border)]"
                    style={{ background: dashboardHwidUserAgentPie.gradient }}
                    aria-label={t("pages.clients.hwidUserAgentShareTitle", {
                      defaultValue: "User-Agent distribution by HWID",
                    })}
                  >
                    <div className="absolute inset-[22%] rounded-full bg-[var(--bg-elevated)]" />
                  </div>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto pr-1">
                  {dashboardHwidUserAgentPie.parts.map((item) => (
                    <div key={item.label} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate font-mono text-[var(--fg-muted)]">
                          {item.label}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-[var(--fg)]">
                        {item.percentLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Surface>
        </Reveal>
        )}

        {showDatabase && (
        <Reveal className="mt-4">
          <Surface>
            <div className="mb-3 flex items-center gap-2">
              <IconTile icon={Database} tone="neutral" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.database")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatBlock title={t("pages.index.dbSize")} value={sizeFormat(st.database?.size ?? 0)} />
              <StatBlock title={t("pages.index.dbTables")} value={String(st.database?.tables ?? 0)} />
              <StatBlock title={t("pages.index.dbRows")} value={String(st.database?.totalRows ?? 0)} />
              <StatBlock
                title={t("pages.index.dbConnections")}
                value={`${st.database?.openConns ?? 0} / ${st.database?.maxOpenConns ?? 0}`}
              />
            </div>
          </Surface>
        </Reveal>
        )}

        {showPanelRuntime && (
        <Reveal className="mt-4">
          <Surface>
            <div className="mb-3 flex items-center gap-2">
              <IconTile icon={Cpu} tone="info" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.panelProcessTitle")}</h3>
            </div>
            <p className="mb-3 text-xs text-[var(--fg-muted)]">{t("pages.index.panelProcessDesc")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBlock
                title={t("pages.index.logicalProcessors")}
                value={String(st.logicalPro ?? st.cpuCores ?? "—")}
              />
              <StatBlock title={t("pages.index.frequency")} value={cpuGhz} />
              <StatBlock
                title={t("pages.index.threads")}
                value={String(st.appStats?.threads ?? "—")}
              />
              <StatBlock
                title={t("pages.index.panelProcessHeap")}
                value={sizeFormat(st.appStats?.mem ?? 0)}
              />
            </div>
          </Surface>
        </Reveal>
        )}

        {showNetwork && (
        <Reveal className="mt-4">
          <Surface>
            <div className="mb-4 flex items-center gap-2">
              <IconTile icon={Network} tone="info" size="sm" />
              <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.networkGroupTitle")}</h3>
            </div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("pages.index.netCurrentRates")}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Surface
                padding="sm"
                className="group relative overflow-hidden border-[var(--border)]/80 bg-gradient-to-b from-[var(--bg-elevated)]/95 via-[var(--surface)]/60 to-[var(--bg)]/50 shadow-sm transition duration-200 hover:shadow-md hover:ring-1 hover:ring-[var(--accent)]/25"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/25 to-transparent opacity-0 blur-2xl transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative">
                  <StatBlock
                    title={t("pages.index.upload")}
                    value={<CountSize value={st.netIO.up} />}
                    prefix={<ArrowUp size={16} className="text-emerald-400/90" />}
                    suffix="/s"
                  />
                </div>
                <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]/35">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500/80 to-[var(--accent)] transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(4, (st.netIO.up / trafficMax) * 100)}%` }}
                  />
                </div>
              </Surface>
              <Surface
                padding="sm"
                className="group relative overflow-hidden border-[var(--border)]/80 bg-gradient-to-b from-[var(--bg-elevated)]/95 via-[var(--surface)]/60 to-[var(--bg)]/50 shadow-sm transition duration-200 hover:shadow-md hover:ring-1 hover:ring-sky-400/30"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-sky-500/25 to-transparent opacity-0 blur-2xl transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative">
                  <StatBlock
                    title={t("pages.index.download")}
                    value={<CountSize value={st.netIO.down} />}
                    prefix={<ArrowDown size={16} className="text-sky-400/90" />}
                    suffix="/s"
                  />
                </div>
                <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]/35">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500/80 to-cyan-400/70 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(4, (st.netIO.down / trafficMax) * 100)}%` }}
                  />
                </div>
              </Surface>
            </div>
            <p className="mb-2 mt-5 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("pages.index.netCumulativeTraffic")}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-2">
              <Surface
                padding="sm"
                className="group relative overflow-hidden border-[var(--border)]/80 bg-gradient-to-b from-[var(--bg-elevated)]/95 via-[var(--surface)]/60 to-[var(--bg)]/50 shadow-sm transition duration-200 hover:shadow-md hover:ring-1 hover:ring-amber-400/25"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-amber-500/20 to-transparent opacity-0 blur-2xl transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative">
                  <StatBlock
                    title={t("pages.index.sent")}
                    value={<CountSize value={st.netTraffic.sent} />}
                    prefix={<CloudUpload size={16} className="text-amber-400/90" />}
                  />
                </div>
                <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]/35">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500/75 to-orange-500/60 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(4, (st.netTraffic.sent / trafficMax) * 100)}%` }}
                  />
                </div>
              </Surface>
              <Surface
                padding="sm"
                className="group relative overflow-hidden border-[var(--border)]/80 bg-gradient-to-b from-[var(--bg-elevated)]/95 via-[var(--surface)]/60 to-[var(--bg)]/50 shadow-sm transition duration-200 hover:shadow-md hover:ring-1 hover:ring-violet-400/25"
              >
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-violet-500/20 to-transparent opacity-0 blur-2xl transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="relative">
                  <StatBlock
                    title={t("pages.index.received")}
                    value={<CountSize value={st.netTraffic.recv} />}
                    prefix={<CloudDownload size={16} className="text-violet-400/90" />}
                  />
                </div>
                <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--border)]/35">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500/75 to-fuchsia-500/55 transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(4, (st.netTraffic.recv / trafficMax) * 100)}%` }}
                  />
                </div>
              </Surface>
            </div>
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
                {t("pages.index.netSocketsTitle")}
              </p>
              <div className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
                <Surface padding="sm">
                  <StatBlock
                    title={t("pages.index.statTCP")}
                    value={<CountNumber value={st.tcpCount} />}
                    prefix={<ArrowLeftRight size={16} className="text-[var(--accent)]" />}
                  />
                </Surface>
                <Surface padding="sm">
                  <StatBlock
                    title={t("pages.index.statUDP")}
                    value={<CountNumber value={st.udpCount} />}
                    prefix={<ArrowLeftRight size={16} className="text-[var(--accent)]" />}
                  />
                </Surface>
              </div>
            </div>
            <div className="mt-6 border-t border-[var(--border)] pt-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <IconTile icon={Globe} tone="info" size="sm" />
                  <h3 className="text-sm font-semibold text-[var(--fg)]">{t("pages.index.ipAddresses")}</h3>
                </div>
                <IconButton
                  label={t("pages.index.toggleIpVisibility")}
                  onClick={() => setShowIp((v) => !v)}
                >
                  <Globe size={16} />
                </IconButton>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatBlock
                  title={t("pages.index.statIPv4")}
                  value={showIp ? st.publicIP?.ipv4 : "****"}
                />
                {ipv6Enabled ? (
                  <StatBlock
                    title={t("pages.index.statIPv6")}
                    value={showIp ? st.publicIP?.ipv6 : "****"}
                  />
                ) : null}
              </div>
            </div>
          </Surface>
        </Reveal>
        )}

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

      <Modal open={logsOpen} onClose={() => setLogsOpen(false)} title={t("pages.index.logs")} width={900}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SelectNative className="w-36" value={logLevel} onChange={(e) => setLogLevel(e.target.value)}>
            {["all", "debug", "info", "notice", "warning", "error"].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </SelectNative>
          <SelectNative className="w-32" value={logSource} onChange={(e) => setLogSource(e.target.value)}>
            <option value="all">{t("all")}</option>
            <option value="panel">panel</option>
            <option value="xray">xray</option>
            <option value="node">node</option>
          </SelectNative>
          <Input
            className="min-w-[200px] flex-1"
            value={logSearch}
            onChange={(e) => setLogSearch(e.target.value)}
            placeholder={t("search")}
          />
          <Button variant={logAuto ? "primary" : "secondary"} onClick={() => setLogAuto((v) => !v)}>
            {t("pages.index.toggleAutoScroll", { defaultValue: "Auto-scroll" })}
          </Button>
          <Button variant="secondary" onClick={openLogs}>
            {t("refresh")}
          </Button>
        </div>
        <div
          ref={logsBodyRef}
          className="max-h-[45vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)]"
        >
          <div className="sticky top-0 z-20 grid grid-cols-[150px_90px_120px_1fr] gap-2 border-b border-[var(--border)] bg-[var(--surface)]/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)] backdrop-blur supports-[backdrop-filter]:bg-[var(--surface)]/80">
            <span>{t("pages.index.logTime", { defaultValue: "Time" })}</span>
            <span>{t("pages.index.logLevel", { defaultValue: "Level" })}</span>
            <span>{t("pages.index.logSource", { defaultValue: "Source" })}</span>
            <span>{t("pages.index.logMessage", { defaultValue: "Message" })}</span>
          </div>
          <div className="font-mono text-xs">
            {visibleLogs.map((row, i) => (
              <div key={`${row.ts}-${i}`} className="grid grid-cols-[150px_90px_120px_1fr] gap-2 border-b border-[var(--border)]/50 px-3 py-1.5 text-[var(--fg-muted)] last:border-b-0">
                <span>{new Date(row.ts || Date.now()).toLocaleTimeString()}</span>
                <span
                  className={`inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelBadgeClass(
                    row.level
                  )}`}
                >
                  {row.level}
                </span>
                <span>{row.source === "node" && row.nodeName ? `node:${row.nodeName}` : row.source}</span>
                <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-[var(--fg)]">
                  {row.message}
                </span>
              </div>
            ))}
            {visibleLogs.length === 0 ? (
              <p className="px-3 py-3 text-[var(--fg-subtle)]">
                {t("pages.index.noLogs", { defaultValue: "No logs" })}
              </p>
            ) : null}
          </div>
        </div>
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

      <Modal open={cpuOpen} onClose={() => setCpuOpen(false)} title={t("pages.index.cpuHistory")} width={900}>
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
                r.obj.map((p0) => ({
                  value: Math.max(0, Math.min(100, p0.cpu)),
                  ts: toUnixMs(Number(p0.t || Date.now())),
                }))
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
        <ResourceHistoryChart
          points={cpuLong}
          stroke={accent}
          gradientId="cpuHistoryAreaGradient"
          hoverIndex={cpuHoverIndex}
          onHoverIndex={setCpuHoverIndex}
          onLeave={() => setCpuHoverIndex(null)}
        />
      </Modal>

      <Modal open={memOpen} onClose={() => setMemOpen(false)} title={t("pages.index.memoryHistory")} width={900}>
        <ResourceHistoryChart
          points={memHistory}
          stroke={ramSparkColor}
          gradientId="memHistoryAreaGradient"
          hoverIndex={memHoverIndex}
          onHoverIndex={setMemHoverIndex}
          onLeave={() => setMemHoverIndex(null)}
        />
      </Modal>

      <Modal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        title={t("pages.index.dashboardCustomize")}
        width={480}
      >
        <p className="mb-4 text-sm leading-relaxed text-[var(--fg-muted)]">
          {t("pages.index.dashboardCustomizeDesc")}
        </p>
        <ul className="list-none space-y-3">
          {DASHBOARD_WIDGET_ORDER.map((id) => (
            <li key={id}>
              <CheckboxField
                id={`dash-widget-${id}`}
                label={t(DASHBOARD_WIDGET_I18N[id])}
                checked={enabledWidgets.includes(id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setEnabledWidgets((prev) => {
                      const next = new Set([...prev, id]);
                      return DASHBOARD_WIDGET_ORDER.filter((w) => next.has(w));
                    });
                  } else {
                    setEnabledWidgets((prev) => toggleDashboardWidget(id, new Set(prev)));
                  }
                }}
              />
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setEnabledWidgets([...DASHBOARD_WIDGET_ORDER])}
          >
            {t("pages.index.dashboardResetLayout")}
          </Button>
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

