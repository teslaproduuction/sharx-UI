"use client";

import { Eye, EyeOff, Map as MapIcon, RotateCcw } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  ComposableMap,
  Geographies,
  Geography,
  Line,
  Marker,
  ZoomableGroup,
} from "react-simple-maps";
import { getJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import {
  mapLinkGoogle,
  mapLinkOpenStreetMap,
  mapLinkYandex,
  reverseGeocodeLabel,
} from "@/lib/reverse-geocode";
import { PageHeader, PageScaffold, Surface } from "@/components/panel";
import { Button, IconButton } from "@/components/ui";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MapZoomContext = createContext(1);

/** ~38 km at mid-latitudes; nearby markers merge into one badge with count. */
const CLUSTER_MAX_DEG = 0.34;

/** Must match ZoomableGroup `maxZoom` (d3 scale k). */
const ZOOMABLE_MAX_ZOOM = 14;

/**
 * From this zoom level upward, clusters break into separate pins (names instead of count).
 * ~82% of max ≈ 11.5 — “near max zoom” without requiring the absolute pinch limit.
 */
const CLUSTER_EXPAND_MIN_K = ZOOMABLE_MAX_ZOOM * 0.82;

/** Ring radius when expanded mode splits exact duplicate coordinates (same 4dp cell). */
const EXPAND_DUP_SPREAD_DEG = 0.408;

type PanelGeo = {
  lat: number;
  lng: number;
  ip?: string;
  source?: string;
  updatedAt?: number;
};

type NodeGeoRow = {
  id: number;
  name: string;
  status: string;
  geoLat?: number;
  geoLng?: number;
  geoUpdatedAt?: number;
  geoSource?: string;
};

type GeographyPayload = {
  panel: PanelGeo | null;
  nodes: NodeGeoRow[];
};

type MapPoint = {
  mapKey: string;
  lat: number;
  lng: number;
  kind: "panel" | "node";
  /** Label when this point is alone in its cluster */
  singleLabel: string;
  status?: string;
};

function distDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = a.lat - b.lat;
  const dLng =
    (a.lng - b.lng) * Math.max(0.2, Math.cos((a.lat * Math.PI) / 180));
  return Math.hypot(dLat, dLng);
}

/** Union–find clusters: all pairs closer than CLUSTER_MAX_DEG end up in one cluster. */
function clusterMapPoints(points: MapPoint[]): MapPoint[][] {
  const n = points.length;
  if (n === 0) return [];
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    return parent[i] === i ? i : (parent[i] = find(parent[i]));
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[rj] = ri;
  }
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (distDeg(points[i], points[j]) <= CLUSTER_MAX_DEG) union(i, j);
    }
  }
  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r)!.push(i);
  }
  return [...buckets.values()].map((idx) => idx.map((i) => points[i]));
}

function clusterCentroid(members: MapPoint[]): { lat: number; lng: number } {
  const lat = members.reduce((s, m) => s + m.lat, 0) / members.length;
  const lng = members.reduce((s, m) => s + m.lng, 0) / members.length;
  return { lat, lng };
}

function CoordMapLinks({
  lat,
  lng,
  t,
}: {
  lat: number;
  lng: number;
  t: (key: string) => string;
}) {
  const cls =
    "text-[var(--ifm-color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ifm-color-primary)] rounded-sm";
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-tight text-[var(--ifm-color-secondary)]">
      <a
        href={mapLinkGoogle(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {t("pages.nodes.geography.mapLinkGoogle")}
      </a>
      <span aria-hidden>·</span>
      <a
        href={mapLinkYandex(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {t("pages.nodes.geography.mapLinkYandex")}
      </a>
      <span aria-hidden>·</span>
      <a
        href={mapLinkOpenStreetMap(lat, lng)}
        target="_blank"
        rel="noopener noreferrer"
        className={cls}
      >
        {t("pages.nodes.geography.mapLinkOsm")}
      </a>
    </div>
  );
}

function clusterFill(members: MapPoint[]): string {
  if (members.some((m) => m.kind === "panel")) {
    return "var(--ifm-color-primary)";
  }
  if (members.some((m) => m.status === "online")) {
    return "hsl(142 70% 38%)";
  }
  return "var(--ifm-color-secondary)";
}

/** One cluster per point; identical lat/lng (4dp) nudged slightly so pins don’t stack. */
function expandedSingletonClusters(points: MapPoint[]): MapPoint[][] {
  const cell = (lat: number, lng: number) =>
    `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const groups = new Map<string, MapPoint[]>();
  for (const p of points) {
    const k = cell(p.lat, p.lng);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const out: MapPoint[][] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.mapKey.localeCompare(b.mapKey));
    const n = sorted.length;
    for (let i = 0; i < n; i++) {
      const p = sorted[i]!;
      if (n === 1) {
        out.push([p]);
        continue;
      }
      const ang = (2 * Math.PI * i) / n;
      const latOff = EXPAND_DUP_SPREAD_DEG * Math.sin(ang);
      const lngOff =
        (EXPAND_DUP_SPREAD_DEG * Math.cos(ang)) /
        Math.max(0.2, Math.cos((p.lat * Math.PI) / 180));
      out.push([
        {
          ...p,
          lat: p.lat + latOff,
          lng: p.lng + lngOff,
        },
      ]);
    }
  }
  return out;
}

/** Wider default view (less “zoomed in”) than before. */
function fitMapView(pts: { lat: number; lng: number }[]): {
  center: [number, number];
  zoom: number;
} {
  if (pts.length === 0) return { center: [0, 15], zoom: 0.92 };
  let minLat = pts[0].lat;
  let maxLat = pts[0].lat;
  let minLng = pts[0].lng;
  let maxLng = pts[0].lng;
  for (const p of pts) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const latSpan = Math.max(maxLat - minLat, 1e-7);
  const lngSpan = Math.max(maxLng - minLng, 1e-7);
  const span = Math.max(latSpan, lngSpan, 0.06);
  const zoom = Math.min(
    6.2,
    Math.max(0.52, 1.55 / Math.sqrt(span * 2.4)),
  );
  return { center: [midLng, midLat], zoom };
}

/** Marker: one name when alone; tight numeric badge when clustered. */
function MapClusterMarker({
  fill,
  label,
  isCluster,
}: {
  fill: string;
  label: string;
  isCluster: boolean;
}) {
  const k = useContext(MapZoomContext);
  const inv = k > 0.001 ? 1 / k : 1;
  if (isCluster) {
    return (
      <g transform={`scale(${inv})`}>
        <circle
          r={8}
          fill={fill}
          stroke="var(--border, #333)"
          strokeWidth={1}
        />
        <text
          textAnchor="middle"
          y={4}
          className="font-bold"
          fill="white"
          style={{
            fontSize: 11,
            paintOrder: "stroke",
            stroke: "rgba(0,0,0,0.35)",
            strokeWidth: 0.6,
          }}
        >
          {label}
        </text>
      </g>
    );
  }
  const short =
    label.length > 22 ? `${label.slice(0, 20).trimEnd()}…` : label;
  return (
    <g transform={`scale(${inv})`}>
      <circle
        r={4.5}
        fill={fill}
        stroke="var(--border, #333)"
        strokeWidth={1}
      />
      <text
        textAnchor="middle"
        y={-10}
        className="fill-[var(--ifm-color-content)] text-[9px] font-medium"
        style={{
          paintOrder: "stroke",
          stroke: "var(--ifm-background-color)",
          strokeWidth: 0.25,
        }}
      >
        {short}
      </text>
    </g>
  );
}

function MapLinkLine({
  from,
  to,
}: {
  from: [number, number];
  to: [number, number];
}) {
  const k = useContext(MapZoomContext);
  const kk = k > 0.001 ? k : 1;
  // Thin stroke + light halo so links stay readable on land at any zoom.
  const w = Math.max(0.35, 0.75 / kk);
  const haloW = w + 1.15;
  return (
    <g>
      <Line
        from={from}
        to={to}
        stroke="var(--ifm-background-color)"
        strokeWidth={haloW}
        strokeOpacity={0.88}
        strokeLinecap="round"
      />
      <Line
        from={from}
        to={to}
        stroke="var(--ifm-color-primary)"
        strokeWidth={w}
        strokeOpacity={0.95}
        strokeLinecap="round"
      />
    </g>
  );
}

export function NodesGeographyPage() {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<GeographyPayload | null>(null);
  const [mapViewKey, setMapViewKey] = useState(0);
  const [mapZoomK, setMapZoomK] = useState(1);
  /** Keys hidden from map: "panel" or "node:<id>". */
  const [mapHidden, setMapHidden] = useState<Set<string>>(() => new Set());
  /** Table row id → "Country, City" from reverse geocode (Photon). */
  const [placeLabels, setPlaceLabels] = useState<Record<string, string>>({});
  const [placesLoading, setPlacesLoading] = useState(false);

  const toggleMapKey = useCallback((key: string) => {
    setMapHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await getJson<GeographyPayload>(panel("node/geography"));
      if (!r.success || !r.obj) {
        setErr(r.msg || t("pages.nodes.geography.loadError"));
        setData(null);
        return;
      }
      setData(r.obj);
    } catch {
      setErr(t("pages.nodes.geography.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const mapDataKey = useMemo(() => {
    if (!data) return "none";
    const p = data.panel;
    const pPart =
      p && typeof p.lat === "number" && typeof p.lng === "number"
        ? `${p.lat.toFixed(5)}:${p.lng.toFixed(5)}`
        : "np";
    const nPart = (data.nodes || [])
      .map(
        (n) =>
          `${n.id}-${typeof n.geoLat === "number" ? n.geoLat : "x"}-${typeof n.geoLng === "number" ? n.geoLng : "x"}`,
      )
      .join("|");
    return `${pPart}#${nPart}`;
  }, [data]);

  const panelPt = useMemo(() => {
    const p = data?.panel;
    if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") {
      return null;
    }
    return { lat: p.lat, lng: p.lng };
  }, [data]);

  const nodesWithGeo = useMemo(() => {
    if (!data?.nodes) return [];
    return data.nodes.filter(
      (n) => typeof n.geoLat === "number" && typeof n.geoLng === "number",
    );
  }, [data]);

  const { center: mapCenter, zoom: mapZoom } = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    if (panelPt) pts.push(panelPt);
    for (const n of nodesWithGeo) {
      pts.push({ lat: n.geoLat as number, lng: n.geoLng as number });
    }
    return fitMapView(pts);
  }, [panelPt, nodesWithGeo]);

  useEffect(() => {
    setMapZoomK(mapZoom);
  }, [mapViewKey, mapDataKey, mapZoom]);

  useEffect(() => {
    let alive = true;
    if (!data) {
      setPlaceLabels({});
      setPlacesLoading(false);
      return;
    }
    const targets: { id: string; lat: number; lng: number }[] = [];
    const p = data.panel;
    if (p && typeof p.lat === "number" && typeof p.lng === "number") {
      targets.push({ id: "panel", lat: p.lat, lng: p.lng });
    }
    for (const n of data.nodes || []) {
      if (typeof n.geoLat === "number" && typeof n.geoLng === "number") {
        targets.push({ id: `n:${n.id}`, lat: n.geoLat, lng: n.geoLng });
      }
    }
    if (targets.length === 0) {
      setPlaceLabels({});
      setPlacesLoading(false);
      return;
    }
    setPlacesLoading(true);
    setPlaceLabels({});

    void (async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        targets.map(async (row) => {
          const text = await reverseGeocodeLabel(
            row.lat,
            row.lng,
            i18n.language,
          );
          if (!alive) return;
          out[row.id] = text.trim() || "—";
        }),
      );
      if (alive) {
        setPlaceLabels(out);
        setPlacesLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [mapDataKey, i18n.language, data]);

  const visibleMapPoints = useMemo(() => {
    const out: MapPoint[] = [];
    if (panelPt && !mapHidden.has("panel")) {
      out.push({
        mapKey: "panel",
        lat: panelPt.lat,
        lng: panelPt.lng,
        kind: "panel",
        singleLabel: t("pages.nodes.geography.legendPanel"),
      });
    }
    for (const n of nodesWithGeo) {
      const key = `node:${n.id}`;
      if (mapHidden.has(key)) continue;
      out.push({
        mapKey: key,
        lat: n.geoLat as number,
        lng: n.geoLng as number,
        kind: "node",
        singleLabel: n.name,
        status: n.status,
      });
    }
    return out;
  }, [panelPt, nodesWithGeo, mapHidden, t]);

  const mapClusters = useMemo(() => {
    if (mapZoomK >= CLUSTER_EXPAND_MIN_K) {
      return expandedSingletonClusters(visibleMapPoints);
    }
    return clusterMapPoints(visibleMapPoints);
  }, [visibleMapPoints, mapZoomK]);

  const nodesMissing = useMemo(() => {
    if (!data?.nodes) return [];
    return data.nodes.filter(
      (n) => typeof n.geoLat !== "number" || typeof n.geoLng !== "number",
    );
  }, [data]);

  const formatGeoTime = (geoUpdatedAt?: number) => {
    if (!geoUpdatedAt) return "—";
    const ts =
      geoUpdatedAt > 1_000_000_000_000 ? geoUpdatedAt : geoUpdatedAt * 1000;
    if (ts <= 0) return "—";
    return new Date(ts).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const showGeoTable =
    (panelPt && data?.panel) || nodesWithGeo.length > 0;

  return (
    <PageScaffold>
      <PageHeader
        icon={MapIcon}
        title={t("pages.nodes.geography.title")}
        description={t("pages.nodes.geography.hint")}
      />

      {loading && !data ? (
        <div
          className="h-[min(520px,70vh)] w-full max-w-[900px] animate-pulse rounded-2xl bg-[var(--surface)]/45"
          aria-hidden
        />
      ) : err ? (
        <Surface className="p-6 text-[var(--ifm-color-danger)]">{err}</Surface>
      ) : (
        <div className="flex flex-col gap-6">
          <Surface className="overflow-hidden p-0">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
              <p className="min-w-0 flex-1 text-sm text-[var(--ifm-color-secondary)]">
                {t("pages.nodes.geography.legendHint")}
                <span className="mt-1 block text-xs opacity-90">
                  {t("pages.nodes.geography.panZoomHint")}
                </span>
              </p>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={() => setMapViewKey((k) => k + 1)}
              >
                <RotateCcw className="mr-1.5 size-4" aria-hidden />
                {t("pages.nodes.geography.resetMapView")}
              </Button>
            </div>
            <div className="relative w-full cursor-grab touch-pan-y bg-[var(--ifm-background-surface-color)] active:cursor-grabbing [&_svg]:max-h-[min(520px,70vh)]">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{
                  scale: 105,
                  center: [0, 15],
                }}
                width={900}
                height={460}
                style={{ width: "100%", height: "auto" }}
              >
                <ZoomableGroup
                  key={`${mapViewKey}-${mapDataKey}`}
                  center={mapCenter}
                  zoom={mapZoom}
                  minZoom={0.45}
                  maxZoom={ZOOMABLE_MAX_ZOOM}
                  onMove={(e) => {
                    const z = (e as { zoom?: number })?.zoom;
                    if (typeof z === "number") setMapZoomK(z);
                  }}
                  onMoveEnd={(e) => {
                    const z = (e as { zoom?: number })?.zoom;
                    if (typeof z === "number") setMapZoomK(z);
                  }}
                >
                  <MapZoomContext.Provider value={mapZoomK}>
                    <Geographies geography={GEO_URL}>
                      {({ geographies }) =>
                        geographies.map((geo) => (
                          <Geography
                            key={geo.rsmKey}
                            geography={geo}
                            fill="var(--ifm-color-emphasis-200)"
                            stroke="var(--border)"
                            strokeWidth={0.4}
                            style={{
                              default: { outline: "none" },
                              hover: { outline: "none" },
                              pressed: { outline: "none" },
                            }}
                          />
                        ))
                      }
                    </Geographies>
                    {panelPt &&
                      !mapHidden.has("panel") &&
                      nodesWithGeo.map((n) => {
                        const key = `node:${n.id}`;
                        if (mapHidden.has(key)) return null;
                        return (
                          <MapLinkLine
                            key={`ln-${n.id}`}
                            from={[panelPt.lng, panelPt.lat]}
                            to={[n.geoLng as number, n.geoLat as number]}
                          />
                        );
                      })}
                    {mapClusters.map((members, ci) => {
                      const c = clusterCentroid(members);
                      const fill = clusterFill(members);
                      const isCluster = members.length > 1;
                      const label = isCluster
                        ? String(members.length)
                        : members[0]!.singleLabel;
                      return (
                        <Marker
                          key={`cl-${ci}-${members.map((m) => m.mapKey).join("-")}`}
                          coordinates={[c.lng, c.lat]}
                        >
                          <MapClusterMarker
                            fill={fill}
                            label={label}
                            isCluster={isCluster}
                          />
                        </Marker>
                      );
                    })}
                  </MapZoomContext.Provider>
                </ZoomableGroup>
              </ComposableMap>
            </div>
          </Surface>

          {!panelPt && (
            <Surface className="p-4 text-sm text-[var(--ifm-color-secondary)]">
              {t("pages.nodes.geography.panelPending")}
            </Surface>
          )}

          {showGeoTable ? (
            <Surface className="overflow-x-auto p-0">
              <div className="border-b border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--ifm-color-content)]">
                {t("pages.nodes.geography.geoTableTitle")}
              </div>
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--ifm-background-surface-color)] text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--ifm-color-secondary)]">
                    <th className="w-14 px-3 py-2">
                      {t("pages.nodes.geography.colMap")}
                    </th>
                    <th className="px-3 py-2">
                      {t("pages.nodes.geography.colName")}
                    </th>
                    <th className="px-3 py-2">
                      {t("pages.nodes.geography.colCoords")}
                    </th>
                    <th className="min-w-[10rem] px-3 py-2">
                      {t("pages.nodes.geography.colLocation")}
                    </th>
                    <th className="px-3 py-2">
                      {t("pages.nodes.geography.colStatus")}
                    </th>
                    <th className="px-3 py-2">
                      {t("pages.nodes.geography.colSource")}
                    </th>
                    <th className="px-3 py-2">
                      {t("pages.nodes.geography.colUpdated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {panelPt && data?.panel ? (
                    <tr className="border-b border-[var(--border)] text-[var(--ifm-color-content)]">
                      <td className="px-3 py-2 align-middle">
                        <IconButton
                          type="button"
                          label={
                            !mapHidden.has("panel")
                              ? t("pages.nodes.geography.hideOnMap")
                              : t("pages.nodes.geography.showOnMap")
                          }
                          onClick={() => toggleMapKey("panel")}
                        >
                          {!mapHidden.has("panel") ? (
                            <Eye size={18} />
                          ) : (
                            <EyeOff
                              size={18}
                              className="opacity-60"
                            />
                          )}
                        </IconButton>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {t("pages.nodes.geography.legendPanel")}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--ifm-color-secondary)]">
                        <div>
                          {panelPt.lat.toFixed(4)}, {panelPt.lng.toFixed(4)}
                        </div>
                        <CoordMapLinks
                          lat={panelPt.lat}
                          lng={panelPt.lng}
                          t={t}
                        />
                      </td>
                      <td className="max-w-[14rem] px-3 py-2 text-[var(--ifm-color-secondary)]">
                        {placesLoading
                          ? t("pages.nodes.geography.locationLoading", {
                              defaultValue: "…",
                            })
                          : (placeLabels.panel ?? "—")}
                      </td>
                      <td className="px-3 py-2 text-[var(--ifm-color-secondary)]">
                        —
                      </td>
                      <td className="px-3 py-2 text-[var(--ifm-color-secondary)]">
                        {data.panel.source ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--ifm-color-secondary)]">
                        {formatGeoTime(data.panel.updatedAt)}
                      </td>
                    </tr>
                  ) : null}
                  {nodesWithGeo.map((n) => {
                    const key = `node:${n.id}`;
                    const lat = n.geoLat as number;
                    const lng = n.geoLng as number;
                    return (
                      <tr
                        key={n.id}
                        className="border-b border-[var(--border)] last:border-0"
                      >
                        <td className="px-3 py-2 align-middle">
                          <IconButton
                            type="button"
                            label={
                              !mapHidden.has(key)
                                ? t("pages.nodes.geography.hideOnMap")
                                : t("pages.nodes.geography.showOnMap")
                            }
                            onClick={() => toggleMapKey(key)}
                          >
                            {!mapHidden.has(key) ? (
                              <Eye size={18} />
                            ) : (
                              <EyeOff
                                size={18}
                                className="opacity-60"
                              />
                            )}
                          </IconButton>
                        </td>
                        <td className="px-3 py-2 font-medium text-[var(--ifm-color-content)]">
                          {n.name}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--ifm-color-secondary)]">
                          <div>
                            {lat.toFixed(4)}, {lng.toFixed(4)}
                          </div>
                          <CoordMapLinks lat={lat} lng={lng} t={t} />
                        </td>
                        <td className="max-w-[14rem] px-3 py-2 text-[var(--ifm-color-secondary)]">
                          {placesLoading
                            ? t("pages.nodes.geography.locationLoading", {
                                defaultValue: "…",
                              })
                            : (placeLabels[`n:${n.id}`] ?? "—")}
                        </td>
                        <td
                          className={
                            n.status === "online"
                              ? "px-3 py-2 text-emerald-600 dark:text-emerald-400"
                              : "px-3 py-2 text-[var(--ifm-color-secondary)]"
                          }
                        >
                          {n.status || "—"}
                        </td>
                        <td className="px-3 py-2 text-[var(--ifm-color-secondary)]">
                          {n.geoSource ?? "—"}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--ifm-color-secondary)]">
                          {formatGeoTime(n.geoUpdatedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Surface>
          ) : null}

          {nodesMissing.length > 0 ? (
            <Surface className="p-4">
              <div className="mb-2 text-sm font-medium text-[var(--ifm-color-content)]">
                {t("pages.nodes.geography.noCoordsTitle")}
              </div>
              <ul className="list-inside list-disc text-sm text-[var(--ifm-color-secondary)]">
                {nodesMissing.map((n) => (
                  <li key={n.id}>
                    {n.name}
                    {n.status ? ` (${n.status})` : ""}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </div>
      )}
    </PageScaffold>
  );
}
