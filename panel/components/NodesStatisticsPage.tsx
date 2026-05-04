"use client";

import { BarChart3, Network, Table2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { getJson } from "@/lib/api";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { sizeFormat } from "@/lib/format";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { IconTile, Segmented, Spinner, useToast } from "@/components/ui";

type NodeStatsRow = {
  id: number;
  name: string;
  address: string;
  status: string;
  up?: number;
  down?: number;
  allTime?: number;
};

type StatsViewMode = "table" | "chart";

type ChartDatum = {
  label: string;
  fullName: string;
  upload: number;
  download: number;
  allTime: number;
};

function mapNodesPayloadToStatsRows(p: unknown): NodeStatsRow[] {
  if (!Array.isArray(p)) return [];
  const out: NodeStatsRow[] = [];
  for (const x of p) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "number") continue;
    out.push({
      id: o.id,
      name: String(o.name ?? ""),
      address: String(o.address ?? ""),
      status: String(o.status ?? "unknown"),
      up: typeof o.up === "number" ? o.up : undefined,
      down: typeof o.down === "number" ? o.down : undefined,
      allTime: typeof o.allTime === "number" ? o.allTime : undefined,
    });
  }
  return out;
}

function tickFormatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  const u = ["", "K", "M", "G", "T"];
  let b = n;
  let i = 0;
  while (b >= 1024 && i < u.length - 1) {
    b /= 1024;
    i++;
  }
  const d = i === 0 ? 0 : b >= 100 || b === Math.floor(b) ? 0 : 1;
  return `${b.toFixed(d)}${u[i]}B`;
}

function NodeStatsChartTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartDatum | undefined;
  if (!row) return null;
  return (
    <div className="max-w-[min(100vw-2rem,20rem)] rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-2 truncate font-medium text-[var(--fg)]" title={row.fullName}>
        {row.fullName}
      </p>
      <ul className="space-y-1 font-mono text-[11px]">
        {payload.map((item) => (
          <li
            key={String(item.dataKey)}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-[var(--fg-muted)]">
              <span
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
            <span className="shrink-0 text-[var(--fg)]">
              {sizeFormat(Number(item.value) || 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodesTrafficChart({ data }: { data: ChartDatum[] }) {
  const { t } = useTranslation();
  const chartMinWidth = Math.max(520, data.length * 56);
  const colors = {
    upload: "var(--accent)",
    download: "var(--accent-ambient)",
    allTime: "#fbbf24",
  };

  return (
    <div className="panel-data-table overflow-x-auto">
      <div className="px-2 pb-2 pt-4 sm:px-4" style={{ minWidth: chartMinWidth }}>
        <ResponsiveContainer width="100%" height={420}>
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
            barCategoryGap="18%"
            barGap={4}
          >
            <defs>
              <linearGradient id="barUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.upload} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.upload} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="barDown" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.download} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.download} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id="barAll" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.allTime} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.allTime} stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 6"
              vertical={false}
              stroke="var(--border)"
              opacity={0.85}
            />
            <XAxis
              dataKey="label"
              tick={{
                fill: "var(--fg-muted)",
                fontSize: 11,
              }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval={0}
              angle={data.length > 6 ? -32 : 0}
              textAnchor={data.length > 6 ? "end" : "middle"}
              height={data.length > 6 ? 56 : 28}
            />
            <YAxis
              tick={{
                fill: "var(--fg-subtle)",
                fontSize: 11,
              }}
              tickLine={false}
              axisLine={false}
              tickFormatter={tickFormatBytes}
              width={48}
            />
            <Tooltip
              content={<NodeStatsChartTooltip />}
              cursor={{
                fill: "color-mix(in oklab, var(--accent) 6%, transparent)",
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: 16 }}
              formatter={(value) => (
                <span className="text-[11px] text-[var(--fg-muted)]">{value}</span>
              )}
            />
            <Bar
              dataKey="upload"
              name={t("pages.nodes.statsColUpload")}
              fill="url(#barUp)"
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="download"
              name={t("pages.nodes.statsColDownload")}
              fill="url(#barDown)"
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="allTime"
              name={t("pages.nodes.statsColAllTime")}
              fill="url(#barAll)"
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NodesStatisticsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const ws = usePanelWebSocket();
  const resyncAfterDisconnect = useRef(false);
  const [rows, setRows] = useState<NodeStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<StatsViewMode>("table");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<NodeStatsRow[]>(panel("node/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) {
      setRows(r.obj as NodeStatsRow[]);
    } else {
      setRows([]);
      if (!r.success) {
        toast.error(t("pages.nodes.loadError"));
      }
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ws) return;
    const onNodes = (p: unknown) => {
      setRows(mapNodesPayloadToStatsRows(p));
      setLoading(false);
    };
    const onDisc = () => {
      resyncAfterDisconnect.current = true;
    };
    const onConn = () => {
      if (resyncAfterDisconnect.current) {
        resyncAfterDisconnect.current = false;
        void load();
      }
    };
    ws.on("nodes", onNodes);
    ws.on("disconnected", onDisc);
    ws.on("connected", onConn);
    return () => {
      ws.off("nodes", onNodes);
      ws.off("disconnected", onDisc);
      ws.off("connected", onConn);
    };
  }, [ws, load]);

  const totals = useMemo(() => {
    let up = 0;
    let down = 0;
    let allTime = 0;
    for (const n of rows) {
      up += n.up ?? 0;
      down += n.down ?? 0;
      allTime += n.allTime ?? 0;
    }
    return { up, down, allTime };
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort(
      (a, b) =>
        (b.up ?? 0) +
        (b.down ?? 0) +
        (b.allTime ?? 0) -
        ((a.up ?? 0) + (a.down ?? 0) + (a.allTime ?? 0)),
    );
  }, [rows]);

  const chartData = useMemo((): ChartDatum[] => {
    return sortedRows.map((r) => {
      const full = r.name.trim() || r.address || `#${r.id}`;
      const short = full.length > 14 ? `${full.slice(0, 12)}…` : full;
      return {
        label: short,
        fullName: full,
        upload: r.up ?? 0,
        download: r.down ?? 0,
        allTime: r.allTime ?? 0,
      };
    });
  }, [sortedRows]);

  const statusLabel = (s: string) => {
    const k = s?.toLowerCase();
    if (k === "online") return t("pages.nodes.online");
    if (k === "offline") return t("pages.nodes.offline");
    if (k === "unknown") return t("pages.nodes.unknown");
    return s || t("pages.nodes.unknown");
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.nodes.statsTitle")}
        icon={Network}
        iconTone="success"
        description={t("pages.nodes.statsHint")}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Surface className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            {t("pages.nodes.statsTotal")} — {t("pages.nodes.statsColUpload")}
          </p>
          <p className="mt-1 font-mono text-lg text-[var(--fg)]">
            {sizeFormat(totals.up)}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            {t("pages.nodes.statsTotal")} — {t("pages.nodes.statsColDownload")}
          </p>
          <p className="mt-1 font-mono text-lg text-[var(--fg)]">
            {sizeFormat(totals.down)}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
            {t("pages.nodes.statsTotal")} — {t("pages.nodes.statsColAllTime")}
          </p>
          <p className="mt-1 font-mono text-lg text-[var(--fg)]">
            {sizeFormat(totals.allTime)}
          </p>
        </Surface>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        <Segmented<StatsViewMode>
          layoutId="nodes-stats-view"
          value={viewMode}
          onChange={setViewMode}
          items={[
            {
              id: "table",
              label: t("pages.nodes.statsViewTable"),
              icon: Table2,
            },
            {
              id: "chart",
              label: t("pages.nodes.statsViewChart"),
              icon: BarChart3,
            },
          ]}
        />
      </div>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="grid min-h-40 place-content-center gap-3 px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
            <IconTile icon={Network} tone="neutral" size="lg" />
            <p>{t("noData")}</p>
          </div>
        ) : viewMode === "chart" ? (
          <NodesTrafficChart data={chartData} />
        ) : (
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th className="p-3">{t("pages.nodes.name")}</th>
                  <th className="p-3">{t("pages.nodes.status")}</th>
                  <th className="p-3">{t("pages.nodes.statsColUpload")}</th>
                  <th className="p-3">{t("pages.nodes.statsColDownload")}</th>
                  <th className="p-3">{t("pages.nodes.statsColAllTime")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                  >
                    <td className="p-3 text-[var(--fg)]">{r.name}</td>
                    <td className="p-3 text-xs">{statusLabel(r.status)}</td>
                    <td className="p-3 font-mono text-xs">
                      {sizeFormat(r.up ?? 0)}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {sizeFormat(r.down ?? 0)}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {sizeFormat(r.allTime ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </PageScaffold>
  );
}
