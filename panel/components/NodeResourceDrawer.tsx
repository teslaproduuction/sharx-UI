"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";
import { getJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { Button, Modal, SelectNative, Spinner } from "@/components/ui";

type HistoryPoint = { t: number; v: number };

type SeriesRow = {
  key: string;
  name: string;
  points: { t?: number; time?: number; cpu?: number; mem?: number; disk?: number; v?: number }[];
};

function parseSeries(obj: unknown, metric: "cpu" | "mem" | "disk", nodeKey: string): HistoryPoint[] {
  if (!obj || typeof obj !== "object") return [];
  const ser = (obj as { series?: SeriesRow[] }).series;
  if (!Array.isArray(ser)) return [];
  const row = ser.find((s) => s.key === nodeKey);
  if (!row?.points) return [];
  return row.points.map((p) => {
    const ts = Number(p.t ?? p.time ?? 0);
    const raw =
      metric === "cpu"
        ? Number(p.cpu ?? p.v)
        : metric === "disk"
          ? Number(p.disk ?? p.v)
          : Number(p.mem ?? p.v);
    return { t: ts, v: Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0 };
  });
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pointer-events-none rounded-md border border-[var(--border)] bg-[var(--bg-elevated)]/96 px-2.5 py-1.5 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 text-[var(--fg-muted)]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: String(entry.stroke ?? entry.color) }}
            />
            <span className="font-medium text-[var(--fg)]">{entry.name}</span>
          </span>
          <span className="font-mono text-[var(--fg)]">
            {typeof entry.value === "number" ? entry.value.toFixed(1) : entry.value}%
          </span>
        </div>
      ))}
    </div>
  );
}

function MetricChart({
  title,
  data,
  color,
}: {
  title: string;
  data: HistoryPoint[];
  color: string;
}) {
  const chartData = useMemo(
    () =>
      data.map((p) => ({
        ...p,
        label: new Date(p.t < 1e12 ? p.t * 1000 : p.t).toLocaleTimeString(),
      })),
    [data],
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="text-sm font-medium text-[var(--fg)]">{title}</span>
        <span className="ml-auto text-xs text-[var(--fg-muted)]">
          {data.length ? `${data[data.length - 1]?.v.toFixed(1)}%` : "—"}
        </span>
      </div>
      <div className="h-40 w-full">
        {chartData.length < 2 ? (
          <p className="py-8 text-center text-xs text-[var(--fg-subtle)]">Collecting samples…</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--fg-muted)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "var(--fg-muted)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "var(--fg-subtle)", strokeOpacity: 0.4, strokeDasharray: "4 5" }}
              />
              <Area
                type="monotone"
                dataKey="v"
                name={title}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export function NodeResourceDrawer({
  open,
  nodeId,
  nodeName,
  onClose,
}: {
  open: boolean;
  nodeId: number | null;
  nodeName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [bucket, setBucket] = useState("60");
  const [loading, setLoading] = useState(false);
  const [cpu, setCpu] = useState<HistoryPoint[]>([]);
  const [mem, setMem] = useState<HistoryPoint[]>([]);
  const [disk, setDisk] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (!open || nodeId == null) return;
    const key = `node-${nodeId}`;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [cr, mr, dr] = await Promise.all([
          getJson<unknown>(panel(`api/server/cpuHistory/${bucket}`)),
          getJson<unknown>(panel(`api/server/memHistory/${bucket}`)),
          getJson<unknown>(panel(`api/server/diskHistory/${bucket}`)),
        ]);
        if (cancelled) return;
        if (cr.success) setCpu(parseSeries(cr.obj, "cpu", key));
        if (mr.success) setMem(parseSeries(mr.obj, "mem", key));
        if (dr.success) setDisk(parseSeries(dr.obj, "disk", key));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, nodeId, bucket]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={nodeName || t("pages.nodes.resourceTitle", { defaultValue: "Node resources" })}
    >
      <div className="mb-4 flex items-center gap-2">
        <SelectNative value={bucket} onChange={(e) => setBucket(e.target.value)} className="max-w-[140px]">
          <option value="30">30s</option>
          <option value="60">1 min</option>
          <option value="120">2 min</option>
          <option value="300">5 min</option>
        </SelectNative>
        {loading ? <Spinner className="h-4 w-4" /> : null}
        <Button type="button" variant="secondary" className="!h-8" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
      <div className="space-y-3">
        <MetricChart
          title={t("pages.index.cpu", { defaultValue: "CPU" })}
          data={cpu}
          color="var(--accent)"
        />
        <MetricChart
          title={t("pages.index.ram", { defaultValue: "RAM" })}
          data={mem}
          color="var(--chart-purple, #a78bfa)"
        />
        <MetricChart
          title={t("pages.index.disk", { defaultValue: "Disk" })}
          data={disk}
          color="var(--chart-green, #22c55e)"
        />
      </div>
    </Modal>
  );
}
