"use client";

import { RefreshCw, Users } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
import { sizeFormat } from "@/lib/format";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Modal, PillTag, Spinner, useToast } from "@/components/ui";

type Col = {
  id: number;
  name: string;
  status: string;
  fetch: string;
  fetchError?: string;
};

type Cell = {
  up: number;
  down: number;
  online: boolean;
  ok: boolean;
};

type Row = { email: string; values: Cell[] };

type MatrixPayload = {
  multiNode: boolean;
  nodes: Col[] | null;
  rows: Row[] | null;
};

function isClientTrafficPerNodeMatrix(p: unknown): p is MatrixPayload {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return typeof o.multiNode === "boolean";
}

type ClientNodeChartDatum = {
  label: string;
  fullName: string;
  upload: number;
  download: number;
};

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

function ClientNodeChartTooltip({
  active,
  payload,
}: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ClientNodeChartDatum | undefined;
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

function ClientsTrafficByNodeChart({
  data,
  gradientPrefix,
}: {
  data: ClientNodeChartDatum[];
  gradientPrefix: string;
}) {
  const { t } = useTranslation();
  const chartMinWidth = Math.max(520, data.length * 56);
  const upId = `${gradientPrefix}-up`;
  const downId = `${gradientPrefix}-down`;
  const colors = {
    upload: "var(--accent)",
    download: "var(--accent-ambient)",
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
              <linearGradient id={upId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.upload} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.upload} stopOpacity={0.45} />
              </linearGradient>
              <linearGradient id={downId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.download} stopOpacity={0.95} />
                <stop offset="100%" stopColor={colors.download} stopOpacity={0.45} />
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
              content={<ClientNodeChartTooltip />}
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
              name={t("pages.clients.statsColUpload")}
              fill={`url(#${upId})`}
              radius={[5, 5, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
            <Bar
              dataKey="download"
              name={t("pages.clients.statsColDownload")}
              fill={`url(#${downId})`}
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

function buildChartDataForRow(
  row: Row,
  nodes: Col[],
  colTitle: (c: Col) => string,
): ClientNodeChartDatum[] {
  return nodes.map((c, i) => {
    const v = row.values[i];
    const full = colTitle(c);
    const short = full.length > 14 ? `${full.slice(0, 12)}…` : full;
    if (!v?.ok) {
      return { label: short, fullName: full, upload: 0, download: 0 };
    }
    return { label: short, fullName: full, upload: v.up, download: v.down };
  });
}

export function ClientsStatisticsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const ws = usePanelWebSocket();
  const resyncAfterDisconnect = useRef(false);
  const chartGradientPrefix = useId().replace(/:/g, "");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [chartEmail, setChartEmail] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<MatrixPayload>(panel("node/client-traffic-per-node"));
    setLoading(false);
    if (r.success && r.obj) {
      setData(r.obj);
    } else {
      setData(null);
      toast.error(t("pages.clients.statsLoadError"));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ws) return;
    const onMatrix = (p: unknown) => {
      if (!isClientTrafficPerNodeMatrix(p)) return;
      setData(p);
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
    ws.on("client_traffic_per_node", onMatrix);
    ws.on("disconnected", onDisc);
    ws.on("connected", onConn);
    return () => {
      ws.off("client_traffic_per_node", onMatrix);
      ws.off("disconnected", onDisc);
      ws.off("connected", onConn);
    };
  }, [ws, load]);

  const nodes = data?.nodes ?? [];
  const rows = data?.rows ?? [];
  const emptyMulti = Boolean(
    data?.multiNode && !nodes.length && !loading
  );

  const colTitle = useCallback(
    (c: Col) => {
      if (c.id === 0) return t("pages.clients.statsLocalColumn");
      return c.name || `Node ${c.id}`;
    },
    [t]
  );

  const chartRow = useMemo(
    () => (data?.rows ?? []).find((r) => r.email === chartEmail) ?? null,
    [data?.rows, chartEmail]
  );

  const modalChartData = useMemo(() => {
    const ns = data?.nodes ?? [];
    if (!chartRow || !ns.length) return [];
    return buildChartDataForRow(chartRow, ns, colTitle);
  }, [chartRow, data?.nodes, colTitle]);

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.clients.statsTitle")}
        icon={Users}
        iconTone="accent"
        actions={
          <Button
            type="button"
            variant="secondary"
            className="!gap-2"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            {t("pages.clients.statsRefresh")}
          </Button>
        }
      />
      <p className="mb-4 max-w-3xl text-xs text-[var(--fg-muted)]">
        {t("pages.clients.statsHint")}
      </p>
      {!loading && data && !emptyMulti && rows.length > 0 ? (
        <p className="mb-3 max-w-3xl text-xs text-[var(--fg-subtle)]">
          {t("pages.clients.statsRowChartHint")}
        </p>
      ) : null}

      {loading && !data ? (
        <div className="grid min-h-48 place-items-center">
          <Spinner size={32} />
        </div>
      ) : !data && !loading ? (
        <div className="grid min-h-40 place-content-center gap-3 px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
          <IconTile icon={Users} tone="neutral" size="lg" />
          <p>{t("noData")}</p>
        </div>
      ) : emptyMulti ? (
        <div className="grid min-h-40 place-content-center gap-3 px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
          <IconTile icon={Users} tone="neutral" size="lg" />
          <p>{t("pages.clients.statsEmptyNodes")}</p>
        </div>
      ) : (
        <Surface padding="none" className="overflow-hidden">
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                    <th className="sticky left-0 z-10 bg-[var(--bg-elevated)] p-3 shadow-[1px_0_0_0_var(--border)]">
                      {t("pages.clients.email")}
                    </th>
                    {nodes.map((c) => (
                      <th key={c.id} className="min-w-[10rem] p-3 align-bottom">
                        <div className="font-semibold text-[var(--fg)] normal-case">
                          {colTitle(c)}
                        </div>
                        {c.id !== 0 ? (
                          <div className="mt-0.5 text-[10px] font-normal normal-case text-[var(--fg-muted)]">
                            {c.status}
                          </div>
                        ) : null}
                        {c.fetch !== "ok" ? (
                          <span
                            className="inline-block max-w-full"
                            title={c.fetchError || undefined}
                          >
                            <PillTag tone="rose" className="mt-1 !text-[10px]">
                              {c.fetch === "skipped"
                                ? t("pages.clients.statsNodeSkipped")
                                : t("pages.clients.statsNodeError")}
                            </PillTag>
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={Math.max(1, nodes.length) + 1}
                        className="p-6 text-center text-sm text-[var(--fg-muted)]"
                      >
                        {t("noData")}
                      </td>
                    </tr>
                  ) : null}
                  {rows.map((row) => (
                    <tr
                      key={row.email}
                      className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                    >
                      <td className="sticky left-0 z-10 bg-[var(--bg-elevated)] p-0 shadow-[1px_0_0_0_var(--border)]">
                        <button
                          type="button"
                          className="w-full px-3 py-3 text-left font-medium text-[var(--fg)] underline-offset-2 hover:underline focus-visible:outline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                          onClick={() => setChartEmail(row.email)}
                        >
                          {row.email}
                        </button>
                      </td>
                      {row.values.map((v, i) => {
                        const c = nodes[i];
                        const key = `${row.email}-${c?.id ?? i}`;
                        if (!v.ok) {
                          return (
                            <td
                              key={key}
                              className="p-3 font-mono text-xs"
                              title={c?.fetchError || undefined}
                            >
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={key} className="p-3 align-top text-xs">
                            <div className="font-mono text-[var(--fg)]">
                              ↑ {sizeFormat(v.up)}
                            </div>
                            <div className="font-mono text-[var(--fg)]">
                              ↓ {sizeFormat(v.down)}
                            </div>
                            <div className="mt-1">
                              {v.online ? (
                                <PillTag tone="green" className="!px-1.5 !py-0 !text-[10px]">
                                  {t("pages.clients.statsOnlineShort")}
                                </PillTag>
                              ) : (
                                <span className="text-[10px] text-[var(--fg-subtle)]">·</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </Surface>
      )}

      <Modal
        open={chartEmail != null}
        onClose={() => setChartEmail(null)}
        title={
          chartEmail
            ? `${t("pages.clients.statsUserChartTitle")} · ${chartEmail}`
            : t("pages.clients.statsUserChartTitle")
        }
        width={720}
        footer={
          <Button type="button" variant="secondary" onClick={() => setChartEmail(null)}>
            {t("pages.clients.statsUserChartClose")}
          </Button>
        }
      >
        {modalChartData.length > 0 ? (
          <ClientsTrafficByNodeChart
            data={modalChartData}
            gradientPrefix={chartGradientPrefix}
          />
        ) : (
          <p className="py-8 text-center text-sm text-[var(--fg-muted)]">{t("noData")}</p>
        )}
      </Modal>
    </PageScaffold>
  );
}
