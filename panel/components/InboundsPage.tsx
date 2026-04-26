"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Eye,
  Filter,
  KeyRound,
  Network,
  Pencil,
  Plus,
  Server,
  SlidersHorizontal,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import {
  buildSettingsJson,
  buildSniffingFromForm,
  buildStreamSettingsFromForm,
  buildWireguardInboundApiPayload,
  defaultWireguardForm,
  defaultSniffingForm,
  defaultSniffingString,
  defaultStreamForm,
  defaultStreamSettingsString,
  getInboundStreamTransportMode,
  hostFromRealityTarget,
  mergeFirstClientIntoSettings,
  newWireGuardSecretKeyBase64,
  parseFirstClientFromSettings,
  parseWireguardSettingsToForm,
  parseSniffingToForm,
  parseStreamSettingsToForm,
  randomPassword,
  randomQuicKey,
  randomRealityShortIds,
  randomWsPath,
  REALITY_FINGERPRINTS,
  streamPresetShadowsocksWsString,
  streamPresetTcpTlsString,
  suggestRandomTlsSni,
  totalBytesToGbInput,
  type InboundFormProtocol,
  type SniffingFormState,
  type StreamFormState,
} from "@/lib/inboundDefaults";
import { newWireGuardPeerKeypairBase64 } from "@/lib/wireguardKeypair";
import { sizeFormat } from "@/lib/format";
import {
  joinNameFlag,
  NAME_FLAG_SELECT_OPTIONS,
  splitNameFlag,
} from "@/lib/nameFlag";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { panel } from "@/lib/paths";
import { CompareModeFilterField, type CompareOp } from "@/components/CompareModeFilterField";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  Button,
  CheckboxField,
  ConfirmDialog,
  IconButton,
  IconTile,
  Input,
  Modal,
  Reveal,
  SelectNative,
  Spinner,
  Stepper,
  Switch,
  Tabs,
  useToast,
} from "@/components/ui";

function TextArea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-[88px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] ${className}`}
      spellCheck={false}
      {...rest}
    />
  );
}

function InboundFormSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] p-3">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
        {title}
      </div>
      {children}
    </div>
  );
}

type Row = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  up: number;
  down: number;
  total: number;
  enable: boolean;
};

/** Maps panel API / WebSocket inbounds array to list rows. */
function inboundsPayloadToRows(raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  const out: Row[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id !== "number") continue;
    out.push({
      id: o.id,
      remark: String(o.remark ?? ""),
      protocol: String(o.protocol ?? ""),
      port: typeof o.port === "number" ? o.port : 0,
      up: Number(o.up) || 0,
      down: Number(o.down) || 0,
      total: Number(o.total) || 0,
      enable: Boolean(o.enable),
    });
  }
  return out;
}

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

type InboundSortKey = "id" | "remark" | "protocol" | "port" | "used" | "status";
type SortDir = "asc" | "desc";
type InboundFilterStatus = "" | "enabled" | "disabled";

type InboundColumnFilterId = "remark" | "protocol" | "port" | "traffic";

const INBOUND_DEFAULT_FILTERS: Record<InboundColumnFilterId, string> = {
  remark: "",
  protocol: "",
  port: "",
  traffic: "",
};

function parseTrafficFilterBytes(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const m = s.match(/^([\d.]+)\s*(b|kb|mb|gb|tb)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const u = (m[2] || "gb").toLowerCase();
  const mult: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  return n * (mult[u] ?? mult.gb);
}

function usedBytes(r: Row): number {
  return r.up + r.down;
}

function inboundTrafficHaystack(r: Row): string {
  const up = r.up || 0;
  const down = r.down || 0;
  return [
    sizeFormat(up),
    sizeFormat(down),
    sizeFormat(usedBytes(r)),
    String(up),
    String(down),
  ]
    .join(" ")
    .toLowerCase();
}

function compareInbounds(
  a: Row,
  b: Row,
  key: InboundSortKey,
  dir: SortDir,
): number {
  const m = dir === "asc" ? 1 : -1;
  let c = 0;
  switch (key) {
    case "id":
      c = a.id - b.id;
      break;
    case "remark":
      c = a.remark.localeCompare(b.remark, undefined, { sensitivity: "base" });
      break;
    case "protocol":
      c = a.protocol.localeCompare(b.protocol, undefined, { sensitivity: "base" });
      break;
    case "port":
      c = a.port - b.port;
      break;
    case "used":
      c = usedBytes(a) - usedBytes(b);
      break;
    case "status":
      c = (a.enable ? 1 : 0) - (b.enable ? 1 : 0);
      break;
  }
  if (c !== 0) return c * m;
  return (a.id - b.id) * m;
}

function InboundColumnFilterInput({
  value,
  onChange,
  placeholder,
  className = "",
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
  prefix?: string;
}) {
  const input = (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      placeholder={placeholder}
      className={
        prefix
          ? `!h-8 min-w-0 flex-1 !border-0 !bg-transparent !px-2 !py-1 !text-xs ${className}`
          : `!h-8 w-full min-w-[4.5rem] !px-2 !py-1 !text-xs ${className}`
      }
    />
  );
  if (!prefix) return input;
  return (
    <div
      className={`flex min-w-0 items-stretch overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] ${className}`}
    >
      <span
        className="flex shrink-0 items-center border-r border-[var(--border)] bg-[color-mix(in_oklab,var(--border)_35%,transparent)] px-1.5 font-mono text-xs font-semibold text-[var(--fg-muted)]"
        aria-hidden
      >
        {prefix}
      </span>
      {input}
    </div>
  );
}

function InboundSortableTh({
  label,
  sortKey: sk,
  activeKey,
  dir,
  onSort,
  className = "",
}: {
  label: string;
  sortKey: InboundSortKey;
  activeKey: InboundSortKey;
  dir: SortDir;
  onSort: (k: InboundSortKey) => void;
  className?: string;
}) {
  const active = activeKey === sk;
  return (
    <th className={cx("p-3", className)}>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 text-left font-semibold uppercase tracking-wider text-[var(--fg-subtle)] outline-none hover:text-[var(--fg-muted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        onClick={(e) => {
          e.stopPropagation();
          onSort(sk);
        }}
      >
        <span className="truncate">{label}</span>
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0 opacity-90" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0 opacity-90" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-35" aria-hidden />
        )}
      </button>
    </th>
  );
}

type NodeRow = { id: number; name: string };

type InboundDetail = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  listen?: string;
  enable: boolean;
  settings: string;
  streamSettings: string;
  sniffing: string;
  up: number;
  down: number;
  total: number;
  allTime?: number;
  expiryTime: number;
  trafficReset: string;
  nodeIds?: number[];
};

function randomPort() {
  return 10000 + Math.floor(Math.random() * 50000);
}

const PROTOCOLS: { value: InboundFormProtocol; label: string }[] = [
  { value: "vless", label: "VLESS" },
  { value: "vmess", label: "VMess" },
  { value: "trojan", label: "Trojan" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "mixed", label: "Mixed" },
  { value: "hysteria2", label: "Hysteria 2" },
  { value: "wireguard", label: "WireGuard" },
];

const KNOWN_INBOUND_PROTOCOLS = new Set<InboundFormProtocol>([
  "vless",
  "vmess",
  "trojan",
  "shadowsocks",
  "mixed",
  "hysteria",
  "hysteria2",
  "wireguard",
]);

const TRAFFIC_RESET: { value: string; labelKey: string }[] = [
  { value: "never", labelKey: "pages.inbounds.periodicTrafficReset.never" },
  { value: "hourly", labelKey: "pages.inbounds.periodicTrafficReset.hourly" },
  { value: "daily", labelKey: "pages.inbounds.periodicTrafficReset.daily" },
  { value: "weekly", labelKey: "pages.inbounds.periodicTrafficReset.weekly" },
  { value: "monthly", labelKey: "pages.inbounds.periodicTrafficReset.monthly" },
];

const SS_METHODS = [
  "2022-blake3-aes-256-gcm",
  "2022-blake3-aes-128-gcm",
  "aes-256-gcm",
  "aes-128-gcm",
  "chacha20-poly1305",
  "xchacha20-poly1305",
];

const QUIC_HEADER_TYPES: { value: StreamFormState["quicHeaderType"]; label: string }[] = [
  { value: "none", label: "none" },
  { value: "utp", label: "utp" },
  { value: "wechat-video", label: "wechat-video" },
  { value: "dtls", label: "dtls" },
  { value: "wireguard", label: "wireguard" },
  { value: "srtp", label: "srtp" },
];

function isInboundFormProtocol(s: string): s is InboundFormProtocol {
  return KNOWN_INBOUND_PROTOCOLS.has(s as InboundFormProtocol);
}

type InboundStepId =
  | "basics"
  | "transport"
  | "auth"
  | "sniffing"
  | "nodes";

const INBOUND_STEP_ORDER: InboundStepId[] = [
  "basics",
  "transport",
  "auth",
  "sniffing",
  "nodes",
];

type InboundStepMeta = {
  id: InboundStepId;
  icon: LucideIcon;
  labelKey: string;
  labelDefault: string;
  descriptionKey: string;
  descriptionDefault: string;
};

const INBOUND_STEPS: InboundStepMeta[] = [
  {
    id: "basics",
    icon: SlidersHorizontal,
    labelKey: "pages.inbounds.stepBasics",
    labelDefault: "Basics",
    descriptionKey: "pages.inbounds.stepBasicsDesc",
    descriptionDefault: "Name, port, protocol",
  },
  {
    id: "transport",
    icon: Network,
    labelKey: "pages.inbounds.stepTransport",
    labelDefault: "Transport & security",
    descriptionKey: "pages.inbounds.stepTransportDesc",
    descriptionDefault: "Stream & TLS/Reality",
  },
  {
    id: "auth",
    icon: KeyRound,
    labelKey: "pages.inbounds.stepAuth",
    labelDefault: "Authentication",
    descriptionKey: "pages.inbounds.stepAuthDesc",
    descriptionDefault: "Protocol-specific",
  },
  {
    id: "sniffing",
    icon: Eye,
    labelKey: "pages.inbounds.stepSniffing",
    labelDefault: "Sniffing",
    descriptionKey: "pages.inbounds.stepSniffingDesc",
    descriptionDefault: "Destination override",
  },
  {
    id: "nodes",
    icon: Server,
    labelKey: "pages.inbounds.stepNodes",
    labelDefault: "Nodes",
    descriptionKey: "pages.inbounds.stepNodesDesc",
    descriptionDefault: "Where this inbound runs",
  },
];

const PROTOCOL_TONE: Record<string, "accent" | "info" | "warning" | "success" | "neutral"> = {
  vless: "accent",
  vmess: "info",
  trojan: "warning",
  shadowsocks: "success",
  mixed: "neutral",
  hysteria2: "accent",
  hysteria: "accent",
  wireguard: "success",
};

const defaultForm = () => ({
  nameFlag: "",
  remark: "",
  port: randomPort(),
  listen: "",
  enable: true,
  protocol: "vless" as InboundFormProtocol,
  vlessFlow: "",
  trojanPassword: randomPassword(12),
  hysteriaAuth: randomPassword(8),
  ssMethod: "aes-256-gcm",
  ssPassword: randomPassword(12),
  mixedUser: "proxy",
  mixedPassword: randomPassword(12),
  wireguardForm: defaultWireguardForm(),
  totalGb: "0",
  trafficReset: "never",
  streamForm: defaultStreamForm(),
  sniffingForm: defaultSniffingForm(),
});

export function InboundsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleEnableBusyId, setToggleEnableBusyId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [fetchingInbound, setFetchingInbound] = useState(false);
  const [step, setStep] = useState<InboundStepId>("basics");
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [nodeIds, setNodeIds] = useState<Record<number, boolean>>({});
  /** When false/loading, the wizard omits the “Nodes” step (standalone / single node). */
  const [multiNodeMode, setMultiNodeMode] = useState<boolean | null>(null);
  const [baselineSettings, setBaselineSettings] = useState("");
  const [preserveTraffic, setPreserveTraffic] = useState({
    up: 0,
    down: 0,
    allTime: 0,
  });

  const [sortKey, setSortKey] = useState<InboundSortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [columnFilters, setColumnFilters] = useState<
    Record<InboundColumnFilterId, string>
  >(() => ({ ...INBOUND_DEFAULT_FILTERS }));
  const [trafficCompareOp, setTrafficCompareOp] = useState<CompareOp>("");
  const [filterStatus, setFilterStatus] = useState<InboundFilterStatus>("");

  const ws = usePanelWebSocket();
  const resyncAfterDisconnect = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Row[]>(panel("api/inbounds/list"));
    setLoading(false);
    if (r.success && r.obj) {
      setRows(inboundsPayloadToRows(r.obj));
    }
  }, []);

  const loadNodes = useCallback(async () => {
    const r = await getJson<{ id: number; name: string }[]>(panel("node/list"));
    if (r.success && Array.isArray(r.obj)) {
      setNodes(
        (r.obj as { id: number; name: string }[]).map((n) => ({
          id: n.id,
          name: n.name || `Node ${n.id}`,
        })),
      );
    } else {
      setNodes([]);
    }
  }, []);

  const loadMultiNodeMode = useCallback(async () => {
    const s = await postJson<Record<string, unknown>>(panel("setting/all"));
    if (s.success && s.obj) {
      setMultiNodeMode(
        Boolean((s.obj as { multiNodeMode?: boolean }).multiNodeMode),
      );
    } else {
      setMultiNodeMode(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ws) return;
    const onInbounds = (p: unknown) => {
      if (!Array.isArray(p)) return;
      setRows(inboundsPayloadToRows(p));
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
    ws.on("inbounds", onInbounds);
    ws.on("disconnected", onDisc);
    ws.on("connected", onConn);
    return () => {
      ws.off("inbounds", onInbounds);
      ws.off("disconnected", onDisc);
      ws.off("connected", onConn);
    };
  }, [ws, load]);

  useEffect(() => {
    if (modalOpen) {
      void loadNodes();
      void loadMultiNodeMode();
    }
  }, [modalOpen, loadNodes, loadMultiNodeMode]);

  const resetAddForm = useCallback(() => {
    setForm(defaultForm());
    setNodeIds({});
    setBaselineSettings("");
    setEditId(null);
    setStep("basics");
    setPreserveTraffic({ up: 0, down: 0, allTime: 0 });
  }, []);

  const openAdd = () => {
    resetAddForm();
    setStep("basics");
    setFetchingInbound(false);
    setModalOpen(true);
  };

  const openEdit = async (id: number) => {
    setModalOpen(true);
    setFetchingInbound(true);
    setEditId(id);
    setStep("basics");
    try {
      const r = await getJson<InboundDetail>(panel(`api/inbounds/get/${id}`));
      if (!r.success || !r.obj) {
        toast.error((r as { msg?: string }).msg || t("fail"));
        setModalOpen(false);
        setEditId(null);
        return;
      }
      const ib = r.obj as InboundDetail;
      const proto = isInboundFormProtocol(ib.protocol) ? ib.protocol : "vless";
      const parsed = parseFirstClientFromSettings(ib.settings || "{}", proto);
      setBaselineSettings(ib.settings || "{}");
      setPreserveTraffic({
        up: ib.up ?? 0,
        down: ib.down ?? 0,
        allTime: ib.allTime ?? 0,
      });
      const { flag: nameFlag, text: remarkText } = splitNameFlag(
        ib.remark ?? "",
      );
      setForm({
        nameFlag,
        remark: remarkText,
        port: ib.port,
        listen: ib.listen ?? "",
        enable: ib.enable,
        protocol: proto,
        vlessFlow: parsed.vlessFlow ?? "",
        trojanPassword: parsed.trojanPassword ?? randomPassword(12),
        hysteriaAuth: parsed.hysteriaAuth ?? randomPassword(8),
        ssMethod: parsed.ssMethod ?? "aes-256-gcm",
        ssPassword: parsed.ssPassword ?? randomPassword(12),
        mixedUser: parsed.mixedUser ?? "proxy",
        mixedPassword: parsed.mixedPassword ?? randomPassword(12),
        wireguardForm:
          proto === "wireguard"
            ? parseWireguardSettingsToForm(ib.settings || "{}")
            : defaultWireguardForm(),
        totalGb: totalBytesToGbInput(ib.total ?? 0),
        trafficReset: ib.trafficReset || "never",
        streamForm: parseStreamSettingsToForm(
          ib.streamSettings || defaultStreamSettingsString(),
          proto,
        ),
        sniffingForm: parseSniffingToForm(
          ib.sniffing || defaultSniffingString(),
        ),
      });
      const nids: Record<number, boolean> = {};
      for (const nid of ib.nodeIds ?? []) {
        if (nid > 0) nids[nid] = true;
      }
      setNodeIds(nids);
    } catch {
      toast.error(t("fail"));
      setModalOpen(false);
      setEditId(null);
    } finally {
      setFetchingInbound(false);
    }
  };

  const applyStreamPresetForProtocol = (protocol: InboundFormProtocol) => {
    setForm((f) => {
      const isSwitchingToWg = protocol === "wireguard" && f.protocol !== "wireguard";
      const out = {
        ...f,
        protocol,
        streamForm: defaultStreamForm(),
        wireguardForm: isSwitchingToWg ? defaultWireguardForm() : f.wireguardForm,
      };
      if (isSwitchingToWg) {
        out.port = 51820;
        if (!f.remark.trim()) {
          out.remark = t("pages.inbounds.wireguardDefaultRemark", {
            defaultValue: "WireGuard",
          });
        }
        if (!f.listen.trim()) {
          out.listen = "0.0.0.0";
        }
      }
      return out;
    });
  };

  const applyStreamFormPreset = (preset: "tcp" | "tcpTls") => {
    setForm((f) => {
      const json =
        preset === "tcp"
          ? defaultStreamSettingsString()
          : streamPresetTcpTlsString();
      return {
        ...f,
        streamForm: parseStreamSettingsToForm(json, f.protocol),
      };
    });
  };

  const applyStreamFormPresetShadowsocks = (preset: "tcp" | "ws") => {
    setForm((f) => {
      const json =
        preset === "tcp"
          ? defaultStreamSettingsString()
          : streamPresetShadowsocksWsString();
      return {
        ...f,
        streamForm: parseStreamSettingsToForm(json, f.protocol),
      };
    });
  };

  const setStreamFormField = <K extends keyof StreamFormState>(
    key: K,
    value: StreamFormState[K],
  ) => {
    setForm((f) => ({
      ...f,
      streamForm: { ...f.streamForm, [key]: value },
    }));
  };

  const setSniffingFormField = <K extends keyof SniffingFormState>(
    key: K,
    value: SniffingFormState[K],
  ) => {
    setForm((f) => ({
      ...f,
      sniffingForm: { ...f.sniffingForm, [key]: value },
    }));
  };

  const submitModal = async () => {
    if (!form.port || form.port < 1 || form.port > 65535) {
      toast.error(t("pages.inbounds.port") + ": 1–65535");
      return;
    }
    const streamSettingsStr = buildStreamSettingsFromForm(
      form.streamForm,
      form.protocol,
    );
    let streamObj: unknown;
    let sniffObj: unknown;
    try {
      streamObj = JSON.parse(streamSettingsStr);
    } catch {
      toast.error(t("pages.inbounds.invalidStreamJson"));
      return;
    }
    const sniffingStr = buildSniffingFromForm(form.sniffingForm);
    try {
      sniffObj = JSON.parse(sniffingStr);
    } catch {
      toast.error(t("pages.inbounds.invalidSniffingJson"));
      return;
    }
    if (typeof streamObj !== "object" || streamObj === null) {
      toast.error(t("pages.inbounds.invalidStreamJson"));
      return;
    }
    if (typeof sniffObj !== "object" || sniffObj === null) {
      toast.error(t("pages.inbounds.invalidSniffingJson"));
      return;
    }

    const patch = {
      clientEmail: "",
      vlessFlow: form.vlessFlow,
      trojanPassword: form.trojanPassword,
      hysteriaAuth: form.hysteriaAuth,
      ssMethod: form.ssMethod,
      ssPassword: form.ssPassword,
      mixedUser: form.mixedUser,
      mixedPassword: form.mixedPassword,
    };

    let settings: string;
    if (form.protocol === "wireguard") {
      settings = "{}";
    } else if (editId != null) {
      settings = mergeFirstClientIntoSettings(baselineSettings, form.protocol, patch);
    } else {
      settings = buildSettingsJson(form.protocol, patch);
    }

    const tg = parseFloat(form.totalGb);
    const totalBytes =
      Number.isFinite(tg) && tg > 0 ? Math.round(tg * 1024 * 1024 * 1024) : 0;

    const selectedNodeIds = Object.entries(nodeIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => n > 0);

    setModalSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        remark: joinNameFlag(form.nameFlag, form.remark),
        enable: form.enable,
        listen: form.listen.trim(),
        port: form.port,
        protocol: form.protocol,
        settings,
        streamSettings: streamSettingsStr,
        sniffing: sniffingStr,
        total: totalBytes,
        expiryTime: 0,
        trafficReset: form.trafficReset,
        up: editId != null ? preserveTraffic.up : 0,
        down: editId != null ? preserveTraffic.down : 0,
      };
      if (editId != null) {
        body.allTime = preserveTraffic.allTime;
      }
      if (form.protocol === "wireguard") {
        body.wireguard = buildWireguardInboundApiPayload(form.wireguardForm);
      }
      if (selectedNodeIds.length > 0) {
        body.nodeIds = selectedNodeIds;
      }

      const url =
        editId != null
          ? panel(`api/inbounds/update/${editId}`)
          : panel("api/inbounds/add");
      const r = await postJson<unknown>(url, body, true);
      if (r.success) {
        toast.success(
          (r as { msg?: string }).msg || t("success", { defaultValue: "OK" }),
        );
        setModalOpen(false);
        resetAddForm();
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("fail", { defaultValue: "Error" }),
        );
      }
    } catch {
      toast.error(t("fail", { defaultValue: "Error" }));
    } finally {
      setModalSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteId == null) return;
    setDeleting(true);
    const r = await postJson(panel(`api/inbounds/del/${deleteId}`));
    setDeleting(false);
    if (r.success) {
      toast.success(t("success"));
      setDeleteId(null);
      void load();
    } else {
      toast.error((r as { msg?: string }).msg || t("fail"));
    }
  };

  const setInboundEnableFromRow = useCallback(
    async (id: number, nextEnable: boolean) => {
      setToggleEnableBusyId(id);
      try {
        const r = await getJson<InboundDetail>(panel(`api/inbounds/get/${id}`));
        if (!r.success || !r.obj) {
          toast.error((r as { msg?: string }).msg || t("fail"));
          return;
        }
        const ib = r.obj as InboundDetail;
        const body: Record<string, unknown> = {
          remark: ib.remark ?? "",
          enable: nextEnable,
          listen: (ib.listen ?? "").trim(),
          port: ib.port,
          protocol: ib.protocol,
          settings: ib.settings ?? "{}",
          streamSettings: ib.streamSettings ?? defaultStreamSettingsString(),
          sniffing: ib.sniffing ?? defaultSniffingString(),
          total: ib.total ?? 0,
          expiryTime: ib.expiryTime ?? 0,
          trafficReset: ib.trafficReset || "never",
          up: ib.up ?? 0,
          down: ib.down ?? 0,
          allTime: ib.allTime ?? 0,
        };
        const nids = ib.nodeIds?.filter((n) => n > 0) ?? [];
        if (nids.length > 0) body.nodeIds = nids;
        const up = await postJson<unknown>(panel(`api/inbounds/update/${id}`), body, true);
        if (up.success) {
          toast.success(
            (up as { msg?: string }).msg || t("success", { defaultValue: "OK" }),
          );
          void load();
        } else {
          toast.error((up as { msg?: string }).msg || t("fail"));
        }
      } catch {
        toast.error(t("fail"));
      } finally {
        setToggleEnableBusyId(null);
      }
    },
    [load, t, toast],
  );

  const realityFingerprintOptions = useMemo(() => {
    const fp = form.streamForm.realityFingerprint.trim();
    const list: string[] = [...REALITY_FINGERPRINTS];
    if (fp && !list.includes(fp)) list.unshift(fp);
    return list;
  }, [form.streamForm.realityFingerprint]);

  const isEdit = editId != null;

  const inboundStepOrder = useMemo<InboundStepId[]>(
    () =>
      multiNodeMode === true
        ? [...INBOUND_STEP_ORDER]
        : INBOUND_STEP_ORDER.filter((id) => id !== "nodes"),
    [multiNodeMode],
  );

  useEffect(() => {
    if (step === "nodes" && multiNodeMode !== true) {
      setStep("sniffing");
    }
  }, [step, multiNodeMode]);

  const stepIdx = inboundStepOrder.indexOf(step);
  const isLastStep =
    inboundStepOrder.length > 0 &&
    stepIdx === inboundStepOrder.length - 1;
  const isFirstStep = stepIdx === 0;
  const goNextStep = useCallback(() => {
    setStep((s) => {
      const order = inboundStepOrder;
      const idx = order.indexOf(s);
      if (idx < 0) return order[0] ?? "basics";
      return order[Math.min(idx + 1, order.length - 1)];
    });
  }, [inboundStepOrder]);
  const goPrevStep = useCallback(() => {
    setStep((s) => {
      const order = inboundStepOrder;
      const idx = order.indexOf(s);
      if (idx < 0) return order[0] ?? "basics";
      return order[Math.max(idx - 1, 0)];
    });
  }, [inboundStepOrder]);

  const stepperItems = useMemo(
    () =>
      inboundStepOrder.map((id) => {
        const s = INBOUND_STEPS.find((x) => x.id === id);
        if (!s) {
          return {
            id,
            label: id,
            description: "",
            icon: SlidersHorizontal,
          };
        }
        return {
          id: s.id,
          label: t(s.labelKey, { defaultValue: s.labelDefault }),
          description: t(s.descriptionKey, { defaultValue: s.descriptionDefault }),
          icon: s.icon,
        };
      }),
    [t, inboundStepOrder],
  );

  const tabItems = useMemo(
    () =>
      inboundStepOrder.map((id) => {
        const s = INBOUND_STEPS.find((x) => x.id === id);
        if (!s) {
          return { id, label: id, title: id, icon: SlidersHorizontal };
        }
        const label = t(s.labelKey, { defaultValue: s.labelDefault });
        const desc = t(s.descriptionKey, { defaultValue: s.descriptionDefault });
        return {
          id: s.id,
          label,
          title: desc ? `${label} — ${desc}` : label,
          icon: s.icon,
        };
      }),
    [t, inboundStepOrder],
  );

  const modalHeaderIconTone = PROTOCOL_TONE[form.protocol] ?? "accent";

  const protocolOptions = useMemo(() => {
    const base = PROTOCOLS.map((x) => (
      <option key={x.value} value={x.value}>
        {x.label}
      </option>
    ));
    if (isEdit && form.protocol === "hysteria") {
      return [
        <option key="hysteria-legacy" value="hysteria">
          {t("pages.inbounds.protocolHysteriaV1Legacy", {
            defaultValue: "Hysteria (v1, legacy)",
          })}
        </option>,
        ...base,
      ];
    }
    return base;
  }, [isEdit, form.protocol, t]);

  const fillRealitySniFromTarget = useCallback(() => {
    const host = hostFromRealityTarget(form.streamForm.realityTarget);
    if (!host) {
      toast.error(
        t("pages.inbounds.genRealitySniNeedTarget", {
          defaultValue: "Set target (host:port) first.",
        }),
      );
      return;
    }
    const alt = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
    const names = [host, alt].filter((x, i, a) => a.indexOf(x) === i);
    setForm((f) => ({
      ...f,
      streamForm: {
        ...f.streamForm,
        realityServerNames: names.join(","),
        realitySettingsServerName:
          f.streamForm.realitySettingsServerName.trim() || host,
      },
    }));
  }, [form.streamForm.realityTarget, toast, t]);

  const generateRealityX25519 = useCallback(async () => {
    const r = await getJson<{ privateKey: string; publicKey: string }>(
      panel("api/server/getNewX25519Cert"),
    );
    if (!r.success || !r.obj || typeof r.obj !== "object") {
      toast.error((r as { msg?: string }).msg || t("fail"));
      return;
    }
    const o = r.obj as { privateKey?: string; publicKey?: string };
    setForm((f) => ({
      ...f,
      streamForm: {
        ...f.streamForm,
        realityPrivateKey: o.privateKey ?? "",
        realityPublicKey: o.publicKey ?? "",
      },
    }));
    toast.success(t("success", { defaultValue: "OK" }));
  }, [toast, t]);

  const generateRealityMldsa65 = useCallback(async () => {
    const r = await getJson<{ seed: string; verify: string }>(
      panel("api/server/getNewmldsa65"),
    );
    if (!r.success || !r.obj || typeof r.obj !== "object") {
      toast.error((r as { msg?: string }).msg || t("fail"));
      return;
    }
    const o = r.obj as { seed?: string; verify?: string };
    setForm((f) => ({
      ...f,
      streamForm: {
        ...f.streamForm,
        realityMldsa65Seed: o.seed ?? "",
        realityMldsa65Verify: o.verify ?? "",
      },
    }));
    toast.success(t("success", { defaultValue: "OK" }));
  }, [toast, t]);

  const defaultDirForInboundKey = (k: InboundSortKey): SortDir => {
    switch (k) {
      case "used":
        return "desc";
      case "id":
      case "remark":
      case "protocol":
      case "port":
      case "status":
        return "asc";
      default:
        return "asc";
    }
  };

  const toggleInboundSort = useCallback(
    (k: InboundSortKey) => {
      if (k === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(k);
        setSortDir(defaultDirForInboundKey(k));
      }
    },
    [sortKey],
  );

  const filteredInboundRows = useMemo(() => {
    const remarkNeedle = columnFilters.remark.trim().toLowerCase();
    const protocolNeedle = columnFilters.protocol.trim().toLowerCase();
    const portNeedle = columnFilters.port.trim().toLowerCase();
    const trafficRaw = columnFilters.traffic.trim();
    const trafficNeedle =
      trafficCompareOp === "" ? trafficRaw.toLowerCase() : "";
    const trafficThreshold =
      trafficCompareOp !== "" ? parseTrafficFilterBytes(trafficRaw) : null;

    return rows.filter((r) => {
      if (filterStatus === "enabled" && !r.enable) return false;
      if (filterStatus === "disabled" && r.enable) return false;

      if (remarkNeedle && !r.remark.toLowerCase().includes(remarkNeedle)) {
        return false;
      }
      if (protocolNeedle && !r.protocol.toLowerCase().includes(protocolNeedle)) {
        return false;
      }
      if (portNeedle && !String(r.port).toLowerCase().includes(portNeedle)) {
        return false;
      }

      if (trafficCompareOp === "") {
        if (trafficNeedle && !inboundTrafficHaystack(r).includes(trafficNeedle)) {
          return false;
        }
      } else if (trafficThreshold != null) {
        const used = usedBytes(r);
        if (trafficCompareOp === "gt" && !(used > trafficThreshold)) return false;
        if (trafficCompareOp === "lt" && !(used < trafficThreshold)) return false;
        if (trafficCompareOp === "eq" && used !== trafficThreshold) return false;
      }

      return true;
    });
  }, [rows, columnFilters, trafficCompareOp, filterStatus]);

  const hasActiveInboundFilters = useMemo(() => {
    if (filterStatus !== "" || trafficCompareOp !== "") return true;
    return (Object.keys(columnFilters) as InboundColumnFilterId[]).some(
      (k) => columnFilters[k].trim() !== "",
    );
  }, [columnFilters, filterStatus, trafficCompareOp]);

  const displayedInboundRows = useMemo(() => {
    const next = [...filteredInboundRows];
    next.sort((a, b) => compareInbounds(a, b, sortKey, sortDir));
    return next;
  }, [filteredInboundRows, sortKey, sortDir]);

  const isHysteriaFamily =
    form.protocol === "hysteria" || form.protocol === "hysteria2";
  const streamTransportMode = getInboundStreamTransportMode(form.protocol);

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.inbounds")}
        icon={User}
        iconTone="accent"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={openAdd}
              className="!gap-2"
            >
              <Plus size={16} />
              {t("pages.inbounds.addInbound")}
            </Button>
          </>
        }
      />
      <Reveal>
      {rows.length > 0 ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <IconButton
            type="button"
            label={
              filtersVisible
                ? t("pages.clients.filterToggleHide", {
                    defaultValue: "Hide column filters",
                  })
                : t("pages.clients.filterToggleShow", {
                    defaultValue: "Show column filters",
                  })
            }
            aria-pressed={filtersVisible}
            className={
              filtersVisible
                ? "!border-[color-mix(in_oklab,var(--accent)_40%,var(--border))] !bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] !text-[var(--accent)]"
                : undefined
            }
            onClick={() => setFiltersVisible((v) => !v)}
          >
            <Filter size={18} />
          </IconButton>
          {hasActiveInboundFilters ? (
            <Button
              type="button"
              variant="secondary"
              className="!h-9 shrink-0 !gap-2 !text-xs"
              onClick={() => {
                setColumnFilters({ ...INBOUND_DEFAULT_FILTERS });
                setTrafficCompareOp("");
                setFilterStatus("");
              }}
            >
              {t("pages.clients.filterClear", {
                defaultValue: "Reset filters",
              })}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Surface padding="none" className="overflow-visible">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={User} tone="neutral" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
            </div>
          </div>
        ) : (
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-[var(--border)] bg-[var(--surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <InboundSortableTh
                    label={t("remark")}
                    sortKey="remark"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleInboundSort}
                  />
                  <InboundSortableTh
                    label={t("protocol")}
                    sortKey="protocol"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleInboundSort}
                  />
                  <InboundSortableTh
                    label={t("host")}
                    sortKey="port"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleInboundSort}
                    className="tabular-nums"
                  />
                  <InboundSortableTh
                    label={t("pages.inbounds.totalDownUp", {
                      defaultValue: "Up / down",
                    })}
                    sortKey="used"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleInboundSort}
                  />
                  <InboundSortableTh
                    label={t("status")}
                    sortKey="status"
                    activeKey={sortKey}
                    dir={sortDir}
                    onSort={toggleInboundSort}
                  />
                  <th className="p-3">{t("pages.inbounds.operate")}</th>
                </tr>
                {filtersVisible ? (
                  <tr className="border-b border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)]">
                    <th className="p-2 align-top font-normal">
                      <InboundColumnFilterInput
                        value={columnFilters.remark}
                        onChange={(v) =>
                          setColumnFilters((f) => ({ ...f, remark: v }))
                        }
                        placeholder={t("pages.clients.filterColEmail", {
                          defaultValue: "Contains…",
                        })}
                      />
                    </th>
                    <th className="p-2 align-top font-normal">
                      <InboundColumnFilterInput
                        value={columnFilters.protocol}
                        onChange={(v) =>
                          setColumnFilters((f) => ({ ...f, protocol: v }))
                        }
                        placeholder={t("pages.clients.filterColComment", {
                          defaultValue: "Contains…",
                        })}
                      />
                    </th>
                    <th className="p-2 align-top font-normal">
                      <InboundColumnFilterInput
                        value={columnFilters.port}
                        onChange={(v) =>
                          setColumnFilters((f) => ({ ...f, port: v }))
                        }
                        placeholder={t("pages.inbounds.filterPort", {
                          defaultValue: "Contains…",
                        })}
                      />
                    </th>
                    <th className="p-2 align-top font-normal">
                      <CompareModeFilterField
                        mode="traffic"
                        compareOp={trafficCompareOp}
                        onCompareOpChange={setTrafficCompareOp}
                        value={columnFilters.traffic}
                        onValueChange={(v) =>
                          setColumnFilters((f) => ({ ...f, traffic: v }))
                        }
                        placeholder={
                          trafficCompareOp === ""
                            ? t("pages.clients.filterColTraffic", {
                                defaultValue: "Contains…",
                              })
                            : t("pages.clients.filterTrafficAmount", {
                                defaultValue: "e.g. 10 gb",
                              })
                        }
                        className="w-full"
                      />
                    </th>
                    <th className="p-2 align-top font-normal">
                      <SelectNative
                        className="!h-8 w-full min-w-0 !px-2 !text-xs"
                        value={filterStatus}
                        onChange={(e) =>
                          setFilterStatus(e.target.value as InboundFilterStatus)
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label={t("status")}
                      >
                        <option value="">
                          {t("pages.clients.filterConnAll", {
                            defaultValue: "All",
                          })}
                        </option>
                        <option value="enabled">{t("enabled")}</option>
                        <option value="disabled">{t("disabled")}</option>
                      </SelectNative>
                    </th>
                    <th className="p-2" aria-hidden />
                  </tr>
                ) : null}
              </thead>
              <tbody>
                {displayedInboundRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-sm text-[var(--fg-muted)]"
                    >
                      {t("pages.inbounds.filterNoResults", {
                        defaultValue: "No inbounds match the current filters.",
                      })}
                    </td>
                  </tr>
                ) : (
                  displayedInboundRows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                    >
                      <td
                        className="truncate p-3 font-medium text-[var(--fg)]"
                        title={r.remark || "—"}
                      >
                        {r.remark || "—"}
                      </td>
                      <td className="truncate p-3" title={r.protocol}>
                        {r.protocol}
                      </td>
                      <td className="p-3 font-mono tabular-nums">{r.port}</td>
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {sizeFormat(r.up)} / {sizeFormat(r.down)}
                      </td>
                      <td className="p-3">
                        <Switch
                          size="sm"
                          checked={r.enable}
                          disabled={toggleEnableBusyId === r.id}
                          onChange={(next) => void setInboundEnableFromRow(r.id, next)}
                          ariaLabel={`${t("enable")} — ${r.remark || `inbound ${r.id}`}`}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="secondary"
                            className="!p-2"
                            onClick={() => void openEdit(r.id)}
                            aria-label={t("edit")}
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="danger"
                            className="!p-2"
                            onClick={() => setDeleteId(r.id)}
                            aria-label={t("delete")}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
      </Reveal>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!modalSubmitting && !fetchingInbound) {
            setModalOpen(false);
            resetAddForm();
            setFetchingInbound(false);
          }
        }}
        title={isEdit ? t("pages.inbounds.editInbound") : t("pages.inbounds.addInbound")}
        width={isEdit ? 960 : 880}
        dialogClassName="md:max-h-[calc(100dvh-2rem)]"
        footer={
          <div
            className={
              isEdit
                ? "flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                : "flex w-full min-w-0 flex-row items-center justify-end"
            }
          >
            {isEdit ? (
              <span className="min-w-0 text-xs leading-snug text-[var(--fg-subtle)] sm:max-w-[min(100%,24rem)] sm:flex-1 sm:pr-2">
                {t("pages.inbounds.editInboundHint")}
              </span>
            ) : null}
            <div className="inline-flex w-full min-w-0 flex-none flex-wrap items-center justify-end gap-2 sm:w-auto">
              <Button
                variant="secondary"
                type="button"
                disabled={modalSubmitting || fetchingInbound}
                onClick={() => {
                  setModalOpen(false);
                  resetAddForm();
                  setFetchingInbound(false);
                }}
              >
                {t("cancel")}
              </Button>
              {!isEdit && !isFirstStep ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="!gap-1.5"
                  onClick={goPrevStep}
                  disabled={modalSubmitting || fetchingInbound}
                >
                  <ArrowLeft size={14} />
                  {t("pages.inbounds.back", { defaultValue: "Back" })}
                </Button>
              ) : null}
              {!isEdit && !isLastStep ? (
                <Button
                  type="button"
                  variant="primary"
                  className="!gap-1.5"
                  onClick={goNextStep}
                  disabled={modalSubmitting || fetchingInbound}
                >
                  {t("pages.inbounds.next", { defaultValue: "Next" })}
                  <ArrowRight size={14} />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  type="button"
                  loading={modalSubmitting}
                  disabled={fetchingInbound}
                  onClick={() => void submitModal()}
                >
                  {t("pages.inbounds.save", { defaultValue: "Save" })}
                </Button>
              )}
            </div>
          </div>
        }
      >
        {fetchingInbound ? (
          <div className="grid min-h-32 place-items-center">
            <Spinner size={32} />
          </div>
        ) : (
          <div className="space-y-4 pr-1 text-sm">
            <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <IconTile
                  icon={
                    INBOUND_STEPS.find((s) => s.id === step)?.icon ?? SlidersHorizontal
                  }
                  tone={modalHeaderIconTone}
                  size="md"
                />
                <div>
                  <div className="text-sm font-semibold text-[var(--fg)]">
                    {joinNameFlag(form.nameFlag, form.remark) ||
                      t("pages.inbounds.addInbound", { defaultValue: "Add inbound" })}
                  </div>
                  <div className="text-xs text-[var(--fg-muted)]">
                    {t("pages.inbounds.addInboundModalStreamNote")}
                  </div>
                </div>
              </div>
              <div className="text-xs text-[var(--fg-subtle)]">
                {t("protocol")}: <span className="font-mono text-[var(--fg)]">{form.protocol}</span>
                <span className="mx-2">·</span>
                {t("pages.inbounds.port")}: <span className="font-mono text-[var(--fg)]">{form.port}</span>
              </div>
            </div>

            {isEdit ? (
              <div className="overflow-x-auto">
                <Tabs
                  tabs={tabItems}
                  active={step}
                  onChange={(id) => setStep(id as InboundStepId)}
                  variant="pill"
                  size="sm"
                  iconOnly
                />
              </div>
            ) : (
              <Stepper
                steps={stepperItems}
                activeId={step}
                onSelect={(id) => setStep(id as InboundStepId)}
                variant="iconsOnly"
              />
            )}

            {step === "basics" ? (
            <InboundFormSection
              title={t("pages.inbounds.sectionBasics", { defaultValue: "Basics" })}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="w-full shrink-0 sm:max-w-[7.5rem]">
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-name-flag"
                  >
                    {t("pages.inbounds.nameFlag")}
                  </label>
                  <SelectNative
                    id="in-name-flag"
                    value={form.nameFlag}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, nameFlag: e.target.value }))
                    }
                  >
                    {NAME_FLAG_SELECT_OPTIONS.map((o) => (
                      <option key={o.value || "none"} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                <div className="min-w-0 flex-1">
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-remark"
                  >
                    {t("remark")}
                  </label>
                  <Input
                    id="in-remark"
                    value={form.remark}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, remark: e.target.value }))
                    }
                    placeholder="eg. Main"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-port">
                    {t("pages.inbounds.port")} *
                  </label>
                  <Input
                    id="in-port"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.port}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, port: Number(e.target.value) || 0 }))
                    }
                    required
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-proto">
                    {t("protocol")} *
                  </label>
                  <SelectNative
                    id="in-proto"
                    value={form.protocol}
                    disabled={isEdit}
                    onChange={(e) => {
                      const p = e.target.value as InboundFormProtocol;
                      applyStreamPresetForProtocol(p);
                    }}
                  >
                    {protocolOptions}
                  </SelectNative>
                </div>
              </div>

              <div className="mt-3">
                <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-listen">
                  {t("pages.inbounds.addInboundListenLabel")}
                </label>
                <Input
                  id="in-listen"
                  value={form.listen}
                  onChange={(e) => setForm((f) => ({ ...f, listen: e.target.value }))}
                  placeholder="0.0.0.0"
                />
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {t("pages.inbounds.addInboundListenHint")}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-totalgb">
                    {t("pages.inbounds.totalFlowGb", { defaultValue: "Total traffic limit (GB)" })}
                  </label>
                  <Input
                    id="in-totalgb"
                    type="number"
                    min={0}
                    step="0.001"
                    value={form.totalGb}
                    onChange={(e) => setForm((f) => ({ ...f, totalGb: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    {t("pages.inbounds.totalFlowGbHint", { defaultValue: "0 = unlimited" })}
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-tr">
                    {t("pages.inbounds.periodicTrafficResetTitle")}
                  </label>
                  <SelectNative
                    id="in-tr"
                    value={form.trafficReset}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, trafficReset: e.target.value }))
                    }
                  >
                    {TRAFFIC_RESET.map((x) => (
                      <option key={x.value} value={x.value}>
                        {t(x.labelKey)}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--fg-muted)]">{t("enable")}</span>
                <Switch
                  checked={form.enable}
                  onChange={(next) => setForm((f) => ({ ...f, enable: next }))}
                  ariaLabel={t("enable")}
                />
              </div>
            </InboundFormSection>
            ) : null}

            {step === "transport" ? (
            <InboundFormSection
              title={t("pages.inbounds.sectionTransport", {
                defaultValue: "Transport & encryption",
              })}
            >
              <p className="mb-3 text-sm font-medium text-[var(--fg)]">
                {t("pages.inbounds.streamTransport", { defaultValue: "Stream / transport" })}
              </p>
              {isHysteriaFamily ? (
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-hy-udp"
                  >
                    {t("pages.inbounds.hysteriaUdpIdleTimeout", { defaultValue: "UDP idle timeout (sec)" })}
                  </label>
                  <Input
                    id="in-hy-udp"
                    type="number"
                    min={1}
                    max={3600}
                    value={form.streamForm.hysteriaUdpIdleTimeout}
                    onChange={(e) =>
                      setStreamFormField(
                        "hysteriaUdpIdleTimeout",
                        Math.max(1, Number(e.target.value) || 60),
                      )
                    }
                  />
                </div>
              ) : streamTransportMode === "wireguard" ? (
                <p className="text-xs leading-relaxed text-[var(--fg-subtle)]">
                  {t("pages.inbounds.wireguardTransportHint", {
                    defaultValue:
                      "WireGuard uses UDP on the inbound port. There is no TCP/WebSocket `streamSettings` — leave the generated empty `{}` and configure `secretKey`, `address`, and `peers` on the next step (same shape as the Xray WireGuard example).",
                  })}
                </p>
              ) : streamTransportMode === "shadowsocks" ? (
                <>
                  <p className="mb-3 text-xs text-[var(--fg-subtle)]">
                    {form.protocol === "mixed"
                      ? t("pages.inbounds.mixedStreamHint", {
                          defaultValue:
                            "Mixed serves HTTP and SOCKS on one port. Use plain TCP or WebSocket for the stream (no TLS/REALITY on this step — that is for VLESS, VMess, Trojan).",
                        })
                      : t("pages.inbounds.shadowsocksStreamHint", {
                          defaultValue:
                            "Shadowsocks already encrypts payload. The stream is plain TCP or WebSocket (no TLS/REALITY here — that applies to VLESS, VMess, Trojan).",
                        })}
                  </p>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => applyStreamFormPresetShadowsocks("tcp")}
                    >
                      {t("pages.inbounds.presetTcp", { defaultValue: "TCP / no TLS" })}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => applyStreamFormPresetShadowsocks("ws")}
                    >
                      {t("pages.inbounds.presetShadowsocksWs", { defaultValue: "WebSocket" })}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                        htmlFor="in-net-ss"
                      >
                        {t("pages.inbounds.streamNetwork", { defaultValue: "Network" })}
                      </label>
                      <SelectNative
                        id="in-net-ss"
                        value={form.streamForm.network === "ws" ? "ws" : "tcp"}
                        onChange={(e) => {
                          const v = e.target.value;
                          setStreamFormField(
                            "network",
                            (v === "ws" ? "ws" : "tcp") as StreamFormState["network"],
                          );
                        }}
                      >
                        <option value="tcp">TCP</option>
                        <option value="ws">WebSocket</option>
                      </SelectNative>
                    </div>
                    <div className="flex min-h-[2.5rem] items-end pb-0.5 text-xs leading-snug text-[var(--fg-subtle)]">
                      {t("pages.inbounds.streamSecurityNoneForSs", {
                        defaultValue: "Stream security is none (Xray default for this protocol).",
                      })}
                    </div>
                  </div>
                  {form.streamForm.network === "tcp" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-hdr-ss"
                        >
                          {t("pages.inbounds.tcpHeaderType", { defaultValue: "TCP header" })}
                        </label>
                        <SelectNative
                          id="in-hdr-ss"
                          value={form.streamForm.tcpHeaderType}
                          onChange={(e) =>
                            setStreamFormField(
                              "tcpHeaderType",
                              e.target.value as StreamFormState["tcpHeaderType"],
                            )
                          }
                        >
                          <option value="none">none</option>
                          <option value="http">http</option>
                        </SelectNative>
                      </div>
                      <div className="flex items-end pb-1">
                        <CheckboxField
                          checked={form.streamForm.acceptProxyProtocol}
                          onChange={(e) =>
                            setStreamFormField(
                              "acceptProxyProtocol",
                              e.target.checked,
                            )
                          }
                          label={t("pages.inbounds.acceptProxyProtocol", {
                            defaultValue: "Accept proxy protocol",
                          })}
                        />
                      </div>
                    </div>
                  ) : null}
                  {form.streamForm.network === "ws" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-wspath-ss"
                        >
                          {t("pages.inbounds.wsPath", { defaultValue: "WS path" })}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="in-wspath-ss"
                            className="min-w-0 flex-1"
                            value={form.streamForm.wsPath}
                            onChange={(e) =>
                              setStreamFormField("wsPath", e.target.value)
                            }
                            placeholder="/"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() =>
                              setStreamFormField("wsPath", randomWsPath())
                            }
                          >
                            {t("pages.inbounds.genRandomWsPath", {
                              defaultValue: "Random path",
                            })}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-wshost-ss"
                        >
                          {t("pages.inbounds.wsHost", { defaultValue: "Host header" })}
                        </label>
                        <Input
                          id="in-wshost-ss"
                          value={form.streamForm.wsHost}
                          onChange={(e) =>
                            setStreamFormField("wsHost", e.target.value)
                          }
                          placeholder="optional"
                        />
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => applyStreamFormPreset("tcp")}
                    >
                      {t("pages.inbounds.presetTcp", { defaultValue: "TCP / no TLS" })}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => applyStreamFormPreset("tcpTls")}
                    >
                      {t("pages.inbounds.presetTcpTls", { defaultValue: "TCP / TLS" })}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                        htmlFor="in-net"
                      >
                        {t("pages.inbounds.streamNetwork", { defaultValue: "Network" })}
                      </label>
                      <SelectNative
                        id="in-net"
                        value={form.streamForm.network}
                        onChange={(e) =>
                          setStreamFormField(
                            "network",
                            e.target.value as StreamFormState["network"],
                          )
                        }
                      >
                        <option value="tcp">TCP</option>
                        <option value="ws">WebSocket</option>
                        <option value="grpc">gRPC</option>
                        <option value="quic">QUIC</option>
                      </SelectNative>
                    </div>
                    <div>
                      <label
                        className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                        htmlFor="in-sec"
                      >
                        {t("pages.inbounds.streamSecurity", { defaultValue: "Security" })}
                      </label>
                      <SelectNative
                        id="in-sec"
                        value={form.streamForm.security}
                        onChange={(e) =>
                          setStreamFormField(
                            "security",
                            e.target.value as StreamFormState["security"],
                          )
                        }
                      >
                        <option value="none">{t("pages.inbounds.securityNone", { defaultValue: "None" })}</option>
                        <option value="tls">TLS</option>
                        <option value="reality">
                          {t("pages.inbounds.securityReality", { defaultValue: "REALITY" })}
                        </option>
                      </SelectNative>
                    </div>
                  </div>
                  {form.streamForm.network === "tcp" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-hdr"
                        >
                          {t("pages.inbounds.tcpHeaderType", { defaultValue: "TCP header" })}
                        </label>
                        <SelectNative
                          id="in-hdr"
                          value={form.streamForm.tcpHeaderType}
                          onChange={(e) =>
                            setStreamFormField(
                              "tcpHeaderType",
                              e.target.value as StreamFormState["tcpHeaderType"],
                            )
                          }
                        >
                          <option value="none">none</option>
                          <option value="http">http</option>
                        </SelectNative>
                      </div>
                      <div className="flex items-end pb-1">
                        <CheckboxField
                          checked={form.streamForm.acceptProxyProtocol}
                          onChange={(e) =>
                            setStreamFormField(
                              "acceptProxyProtocol",
                              e.target.checked,
                            )
                          }
                          label={t("pages.inbounds.acceptProxyProtocol", {
                            defaultValue: "Accept proxy protocol",
                          })}
                        />
                      </div>
                    </div>
                  ) : null}
                  {form.streamForm.network === "ws" ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-wspath"
                        >
                          {t("pages.inbounds.wsPath", { defaultValue: "WS path" })}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="in-wspath"
                            className="min-w-0 flex-1"
                            value={form.streamForm.wsPath}
                            onChange={(e) =>
                              setStreamFormField("wsPath", e.target.value)
                            }
                            placeholder="/"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() =>
                              setStreamFormField("wsPath", randomWsPath())
                            }
                          >
                            {t("pages.inbounds.genRandomWsPath", {
                              defaultValue: "Random path",
                            })}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-wshost"
                        >
                          {t("pages.inbounds.wsHost", { defaultValue: "Host header" })}
                        </label>
                        <Input
                          id="in-wshost"
                          value={form.streamForm.wsHost}
                          onChange={(e) =>
                            setStreamFormField("wsHost", e.target.value)
                          }
                          placeholder="optional"
                        />
                      </div>
                    </div>
                  ) : null}
                  {form.streamForm.network === "grpc" ? (
                    <div className="mt-3">
                      <label
                        className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                        htmlFor="in-grpc"
                      >
                        {t("pages.inbounds.grpcServiceName", { defaultValue: "gRPC service name" })}
                      </label>
                      <Input
                        id="in-grpc"
                        value={form.streamForm.grpcServiceName}
                        onChange={(e) =>
                          setStreamFormField("grpcServiceName", e.target.value)
                        }
                        placeholder=""
                      />
                    </div>
                  ) : null}
                  {form.streamForm.network === "quic" ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-quic-sec"
                          >
                            {t("pages.inbounds.quicSecurity", { defaultValue: "QUIC encryption" })}
                          </label>
                          <SelectNative
                            id="in-quic-sec"
                            value={form.streamForm.quicSecurity}
                            onChange={(e) =>
                              setStreamFormField(
                                "quicSecurity",
                                e.target.value as StreamFormState["quicSecurity"],
                              )
                            }
                          >
                            <option value="none">none</option>
                            <option value="aes-128-gcm">aes-128-gcm</option>
                            <option value="chacha20-poly1305">chacha20-poly1305</option>
                          </SelectNative>
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-quic-hdr"
                          >
                            {t("pages.inbounds.quicHeaderType", { defaultValue: "QUIC header type" })}
                          </label>
                          <SelectNative
                            id="in-quic-hdr"
                            value={form.streamForm.quicHeaderType}
                            onChange={(e) =>
                              setStreamFormField(
                                "quicHeaderType",
                                e.target.value as StreamFormState["quicHeaderType"],
                              )
                            }
                          >
                            {QUIC_HEADER_TYPES.map((x) => (
                              <option key={x.value} value={x.value}>
                                {x.label}
                              </option>
                            ))}
                          </SelectNative>
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-quic-key"
                        >
                          {t("pages.inbounds.quicKey", { defaultValue: "QUIC key (if encryption enabled)" })}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="in-quic-key"
                            className="min-w-0 flex-1 font-mono text-xs"
                            value={form.streamForm.quicKey}
                            onChange={(e) =>
                              setStreamFormField("quicKey", e.target.value)
                            }
                            autoComplete="off"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            disabled={form.streamForm.quicSecurity === "none"}
                            onClick={() =>
                              setStreamFormField("quicKey", randomQuicKey())
                            }
                          >
                            {t("pages.inbounds.genQuicKey", {
                              defaultValue: "Generate",
                            })}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {form.streamForm.security === "tls" ? (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-sni"
                          >
                            {t("pages.inbounds.tlsServerName", { defaultValue: "Server name (SNI)" })}
                          </label>
                          <div className="flex gap-2">
                            <Input
                              id="in-sni"
                              className="min-w-0 flex-1"
                              value={form.streamForm.tlsServerName}
                              onChange={(e) =>
                                setStreamFormField("tlsServerName", e.target.value)
                              }
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              className="shrink-0 text-xs"
                              onClick={() =>
                                setStreamFormField(
                                  "tlsServerName",
                                  suggestRandomTlsSni(
                                    form.streamForm.wsHost,
                                    form.streamForm.tlsServerName,
                                  ),
                                )
                              }
                            >
                              {t("pages.inbounds.genRandomTlsSni", {
                                defaultValue: "Random SNI",
                              })}
                            </Button>
                          </div>
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-alpn"
                          >
                            {t("pages.inbounds.tlsAlpn", { defaultValue: "ALPN (comma-separated)" })}
                          </label>
                          <Input
                            id="in-alpn"
                            value={form.streamForm.tlsAlpn}
                            onChange={(e) =>
                              setStreamFormField("tlsAlpn", e.target.value)
                            }
                            placeholder="http/1.1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-tlsmv"
                          >
                            {t("pages.inbounds.tlsMinVersion", { defaultValue: "TLS min. version" })}
                          </label>
                          <SelectNative
                            id="in-tlsmv"
                            value={form.streamForm.tlsMinVersion}
                            onChange={(e) =>
                              setStreamFormField(
                                "tlsMinVersion",
                                e.target.value as StreamFormState["tlsMinVersion"],
                              )
                            }
                          >
                            <option value="1.2">1.2</option>
                            <option value="1.3">1.3</option>
                          </SelectNative>
                        </div>
                        <div className="flex items-end pb-1">
                          <CheckboxField
                            checked={form.streamForm.tlsAllowInsecure}
                            onChange={(e) =>
                              setStreamFormField("tlsAllowInsecure", e.target.checked)
                            }
                            label={t("pages.inbounds.tlsAllowInsecure", {
                              defaultValue: "Allow insecure",
                            })}
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-tls-ciph"
                        >
                          {t("pages.inbounds.tlsCipherSuites", { defaultValue: "Cipher suites (optional)" })}
                        </label>
                        <Input
                          id="in-tls-ciph"
                          className="font-mono text-xs"
                          value={form.streamForm.tlsCipherSuites}
                          onChange={(e) =>
                            setStreamFormField("tlsCipherSuites", e.target.value)
                          }
                          placeholder=""
                        />
                      </div>
                      <p className="text-xs text-[var(--fg-subtle)]">
                        {t("pages.inbounds.tlsCertHint", {
                          defaultValue:
                            "Use certificate file + key file on the server, or paste PEM blocks below.",
                        })}
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-tls-certfile"
                          >
                            {t("pages.inbounds.tlsCertificateFile", { defaultValue: "Certificate file path" })}
                          </label>
                          <Input
                            id="in-tls-certfile"
                            className="font-mono text-xs"
                            value={form.streamForm.tlsCertificateFile}
                            onChange={(e) =>
                              setStreamFormField("tlsCertificateFile", e.target.value)
                            }
                            placeholder="/path/to/fullchain.pem"
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-tls-keyfile"
                          >
                            {t("pages.inbounds.tlsKeyFile", { defaultValue: "Private key file path" })}
                          </label>
                          <Input
                            id="in-tls-keyfile"
                            className="font-mono text-xs"
                            value={form.streamForm.tlsKeyFile}
                            onChange={(e) =>
                              setStreamFormField("tlsKeyFile", e.target.value)
                            }
                            placeholder="/path/to/privkey.pem"
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-tls-pem-cert"
                        >
                          {t("pages.inbounds.tlsCertificatePem", { defaultValue: "Certificate (PEM)" })}
                        </label>
                        <TextArea
                          id="in-tls-pem-cert"
                          className="min-h-[100px]"
                          value={form.streamForm.tlsCertificatePem}
                          onChange={(e) =>
                            setStreamFormField("tlsCertificatePem", e.target.value)
                          }
                          placeholder="-----BEGIN CERTIFICATE-----"
                        />
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-tls-pem-key"
                        >
                          {t("pages.inbounds.tlsKeyPem", { defaultValue: "Private key (PEM)" })}
                        </label>
                        <TextArea
                          id="in-tls-pem-key"
                          className="min-h-[100px]"
                          value={form.streamForm.tlsKeyPem}
                          onChange={(e) =>
                            setStreamFormField("tlsKeyPem", e.target.value)
                          }
                          placeholder="-----BEGIN PRIVATE KEY-----"
                        />
                      </div>
                    </div>
                  ) : null}
                  {form.streamForm.security === "reality" ? (
                    <div className="mt-3 space-y-3">
                      <CheckboxField
                        checked={form.streamForm.realityShow}
                        onChange={(e) =>
                          setStreamFormField("realityShow", e.target.checked)
                        }
                        label={t("pages.inbounds.realityShow", { defaultValue: "Show" })}
                      />
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rxver"
                          >
                            {t("pages.inbounds.realityXver", { defaultValue: "Xver" })}
                          </label>
                          <Input
                            id="in-rxver"
                            type="number"
                            min={0}
                            value={form.streamForm.realityXver}
                            onChange={(e) =>
                              setStreamFormField(
                                "realityXver",
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rfp"
                          >
                            {t("pages.inbounds.realityFingerprint", { defaultValue: "uTLS fingerprint" })}
                          </label>
                          <SelectNative
                            id="in-rfp"
                            value={
                              realityFingerprintOptions.includes(
                                form.streamForm.realityFingerprint,
                              )
                                ? form.streamForm.realityFingerprint
                                : realityFingerprintOptions[0] ?? "chrome"
                            }
                            onChange={(e) =>
                              setStreamFormField("realityFingerprint", e.target.value)
                            }
                          >
                            {realityFingerprintOptions.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </SelectNative>
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-rdest"
                        >
                          {t("pages.inbounds.realityTarget", { defaultValue: "Target (host:port)" })}
                        </label>
                        <Input
                          id="in-rdest"
                          value={form.streamForm.realityTarget}
                          onChange={(e) =>
                            setStreamFormField("realityTarget", e.target.value)
                          }
                          placeholder="www.example.com:443"
                        />
                      </div>
                      <div className="rounded-lg border border-[var(--border)]/80 p-3">
                        <label
                          className="mb-2 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-rsni"
                        >
                          {t("pages.inbounds.realityServerNames", {
                            defaultValue: "SNI / server names (comma-separated)",
                          })}
                        </label>
                        <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                          <Input
                            id="in-rsni"
                            className="min-w-0 flex-1 font-mono text-xs"
                            value={form.streamForm.realityServerNames}
                            onChange={(e) =>
                              setStreamFormField("realityServerNames", e.target.value)
                            }
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={fillRealitySniFromTarget}
                          >
                            {t("pages.inbounds.genRealitySniFromTarget", {
                              defaultValue: "SNI from target",
                            })}
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rmtd"
                          >
                            {t("pages.inbounds.realityMaxTimeDiff", {
                              defaultValue: "Max time diff (ms)",
                            })}
                          </label>
                          <Input
                            id="in-rmtd"
                            type="number"
                            min={0}
                            value={form.streamForm.realityMaxTimeDiff}
                            onChange={(e) =>
                              setStreamFormField(
                                "realityMaxTimeDiff",
                                Math.max(0, Number(e.target.value) || 0),
                              )
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rspx"
                          >
                            {t("pages.inbounds.realitySpiderX", { defaultValue: "SpiderX" })}
                          </label>
                          <Input
                            id="in-rspx"
                            value={form.streamForm.realitySpiderX}
                            onChange={(e) =>
                              setStreamFormField("realitySpiderX", e.target.value)
                            }
                            placeholder="/"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rminv"
                          >
                            {t("pages.inbounds.realityMinClientVer", {
                              defaultValue: "Min client version",
                            })}
                          </label>
                          <Input
                            id="in-rminv"
                            value={form.streamForm.realityMinClientVer}
                            onChange={(e) =>
                              setStreamFormField("realityMinClientVer", e.target.value)
                            }
                            placeholder="25.9.11"
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                            htmlFor="in-rmaxv"
                          >
                            {t("pages.inbounds.realityMaxClientVer", {
                              defaultValue: "Max client version",
                            })}
                          </label>
                          <Input
                            id="in-rmaxv"
                            value={form.streamForm.realityMaxClientVer}
                            onChange={(e) =>
                              setStreamFormField("realityMaxClientVer", e.target.value)
                            }
                            placeholder="25.9.11"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="rounded-lg border border-[var(--border)]/80 p-3">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <label
                              className="text-xs font-medium text-[var(--fg-muted)]"
                              htmlFor="in-rsid"
                            >
                              {t("pages.inbounds.realityShortIds", {
                                defaultValue: "Short IDs (comma-separated)",
                              })}
                            </label>
                            <Button
                              type="button"
                              variant="secondary"
                              className="shrink-0 text-xs"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  streamForm: {
                                    ...f.streamForm,
                                    realityShortIds: randomRealityShortIds(),
                                  },
                                }))
                              }
                            >
                              {t("pages.inbounds.genRealityShortIds", {
                                defaultValue: "Generate",
                              })}
                            </Button>
                          </div>
                          <TextArea
                            id="in-rsid"
                            className="min-h-[72px]"
                            value={form.streamForm.realityShortIds}
                            onChange={(e) =>
                              setStreamFormField("realityShortIds", e.target.value)
                            }
                            placeholder=""
                          />
                        </div>
                      </div>
                      <div>
                        <label
                          className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                          htmlFor="in-rssn"
                        >
                          {t("pages.inbounds.realitySettingsServerName", {
                            defaultValue: "settings.serverName (optional)",
                          })}
                        </label>
                        <Input
                          id="in-rssn"
                          value={form.streamForm.realitySettingsServerName}
                          onChange={(e) =>
                            setStreamFormField("realitySettingsServerName", e.target.value)
                          }
                        />
                      </div>
                      <div className="rounded-lg border border-[var(--border)]/80 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--fg-muted)]">
                            {t("pages.inbounds.realityX25519Section", {
                              defaultValue: "REALITY (X25519) key pair",
                            })}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() => void generateRealityX25519()}
                          >
                            {t("pages.inbounds.genRealityX25519", {
                              defaultValue: "Generate key pair",
                            })}
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label
                              className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                              htmlFor="in-rpbk"
                            >
                              {t("pages.inbounds.publicKey", { defaultValue: "Public key" })}
                            </label>
                            <TextArea
                              id="in-rpbk"
                              className="min-h-[72px] font-mono text-xs"
                              value={form.streamForm.realityPublicKey}
                              onChange={(e) =>
                                setStreamFormField("realityPublicKey", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label
                              className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                              htmlFor="in-rpvk"
                            >
                              {t("pages.inbounds.privatekey", { defaultValue: "Private key" })}
                            </label>
                            <TextArea
                              id="in-rpvk"
                              className="min-h-[88px] font-mono text-xs"
                              value={form.streamForm.realityPrivateKey}
                              onChange={(e) =>
                                setStreamFormField("realityPrivateKey", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--border)]/80 p-3">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-medium text-[var(--fg-muted)]">
                            {t("pages.inbounds.realityMldsa65Section", {
                              defaultValue: "ML-DSA-65 (optional)",
                            })}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() => void generateRealityMldsa65()}
                          >
                            {t("pages.inbounds.genRealityMldsa65", {
                              defaultValue: "Generate",
                            })}
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label
                              className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                              htmlFor="in-rmldsa-seed"
                            >
                              {t("pages.inbounds.realityMldsa65Seed", {
                                defaultValue: "mldsa65 seed (optional)",
                              })}
                            </label>
                            <TextArea
                              id="in-rmldsa-seed"
                              className="min-h-[64px] font-mono text-xs"
                              value={form.streamForm.realityMldsa65Seed}
                              onChange={(e) =>
                                setStreamFormField("realityMldsa65Seed", e.target.value)
                              }
                            />
                          </div>
                          <div>
                            <label
                              className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                              htmlFor="in-rmldsa-v"
                            >
                              {t("pages.inbounds.realityMldsa65Verify", {
                                defaultValue: "mldsa65 verify (optional)",
                              })}
                            </label>
                            <TextArea
                              id="in-rmldsa-v"
                              className="min-h-[64px] font-mono text-xs"
                              value={form.streamForm.realityMldsa65Verify}
                              onChange={(e) =>
                                setStreamFormField("realityMldsa65Verify", e.target.value)
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </InboundFormSection>
            ) : null}

            {step === "auth" ? (
            <InboundFormSection
              title={t("pages.inbounds.sectionAuth", {
                defaultValue: "Protocol authentication",
              })}
            >
            {form.protocol === "vless" ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-flow">
                  {t("pages.inbounds.addInboundVlessFlowLabel")}
                </label>
                <SelectNative
                  id="in-flow"
                  value={form.vlessFlow}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, vlessFlow: e.target.value }))
                  }
                >
                  <option value="">{t("pages.inbounds.addInboundVlessFlowNone")}</option>
                  <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                </SelectNative>
              </div>
            ) : null}

            {form.protocol === "trojan" ? (
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                  htmlFor="in-trojan"
                >
                  {t("password")}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="in-trojan"
                    className="flex-1 font-mono text-xs"
                    value={form.trojanPassword}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, trojanPassword: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((f) => ({ ...f, trojanPassword: randomPassword(12) }))
                    }
                  >
                    {t("pages.inbounds.addInboundTrojanRegen")}
                  </Button>
                </div>
              </div>
            ) : null}

            {form.protocol === "mixed" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-mixed-user"
                  >
                    {t("pages.inbounds.mixedAccountUser", {
                      defaultValue: "Account user (SOCKS/HTTP)",
                    })}
                  </label>
                  <Input
                    id="in-mixed-user"
                    className="font-mono text-xs"
                    value={form.mixedUser}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, mixedUser: e.target.value }))
                    }
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-mixed-pass"
                  >
                    {t("password")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="in-mixed-pass"
                      className="min-w-0 flex-1 font-mono text-xs"
                      value={form.mixedPassword}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mixedPassword: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setForm((f) => ({ ...f, mixedPassword: randomPassword(12) }))
                      }
                    >
                      {t("pages.inbounds.addInboundTrojanRegen")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-[var(--fg-subtle)] sm:col-span-2">
                  {t("pages.inbounds.mixedAuthHint", {
                    defaultValue:
                      "First saved account in settings; panel clients map email local-part to this user when syncing to Xray.",
                  })}
                </p>
              </div>
            ) : null}

            {(form.protocol === "hysteria" || form.protocol === "hysteria2") ? (
              <div>
                <label
                  className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                  htmlFor="in-hy-auth"
                >
                  {t("pages.inbounds.hysteriaAuth")}
                </label>
                <div className="flex gap-2">
                  <Input
                    id="in-hy-auth"
                    className="flex-1 font-mono text-xs"
                    value={form.hysteriaAuth}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, hysteriaAuth: e.target.value }))
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((f) => ({ ...f, hysteriaAuth: randomPassword(8) }))
                    }
                  >
                    {t("pages.inbounds.addInboundTrojanRegen")}
                  </Button>
                </div>
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {t("pages.inbounds.hysteriaAuthDesc")}
                </p>
              </div>
            ) : null}

            {form.protocol === "shadowsocks" ? (
              <>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-ssm">
                    {t("pages.inbounds.addInboundSSMethod")}
                  </label>
                  <SelectNative
                    id="in-ssm"
                    value={form.ssMethod}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, ssMethod: e.target.value }))
                    }
                  >
                    {SS_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </SelectNative>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="in-ssp">
                    {t("pages.inbounds.addInboundSSPassword")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="in-ssp"
                      className="flex-1 font-mono text-xs"
                      value={form.ssPassword}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, ssPassword: e.target.value }))
                      }
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setForm((f) => ({ ...f, ssPassword: randomPassword(12) }))
                      }
                    >
                      {t("pages.inbounds.addInboundTrojanRegen")}
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
            {form.protocol === "wireguard" ? (
              <div className="space-y-3">
                <p className="text-xs text-[var(--fg-subtle)]">
                  {t("pages.inbounds.wireguardSettingsHint", {
                    defaultValue:
                      "Server-side WireGuard (UDP): MTU, private key, tunnel addresses, optional peers (client public keys), noKernelTun, optional workers. Settings JSON is built on the server. No panel-managed client rows for this protocol.",
                  })}
                </p>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-wg-mtu"
                  >
                    {t("pages.inbounds.wireguardMtu", { defaultValue: "MTU" })}
                  </label>
                  <Input
                    id="in-wg-mtu"
                    type="number"
                    className="font-mono text-xs"
                    min={1280}
                    max={9000}
                    value={form.wireguardForm.mtu}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setForm((f) => ({
                        ...f,
                        wireguardForm: {
                          ...f.wireguardForm,
                          mtu: Number.isFinite(n) && n > 0 ? n : 1420,
                        },
                      }));
                    }}
                  />
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-wg-sk"
                  >
                    {t("pages.inbounds.wireguardSecretKey", {
                      defaultValue: "Secret key (server private, base64)",
                    })}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="in-wg-sk"
                      className="flex-1 font-mono text-xs"
                      value={form.wireguardForm.secretKey}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          wireguardForm: {
                            ...f.wireguardForm,
                            secretKey: e.target.value,
                          },
                        }))
                      }
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          wireguardForm: {
                            ...f.wireguardForm,
                            secretKey: newWireGuardSecretKeyBase64(),
                          },
                        }))
                      }
                    >
                      {t("pages.inbounds.wireguardRegenKey", {
                        defaultValue: "Regenerate key",
                      })}
                    </Button>
                  </div>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-wg-addr"
                  >
                    {t("pages.inbounds.wireguardAddress", {
                      defaultValue: "Tunnel address (CIDR, one per line)",
                    })}
                  </label>
                  <TextArea
                    id="in-wg-addr"
                    className="min-h-[68px] font-mono text-xs"
                    value={form.wireguardForm.address}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        wireguardForm: {
                          ...f.wireguardForm,
                          address: e.target.value,
                        },
                      }))
                    }
                    spellCheck={false}
                  />
                </div>
                <CheckboxField
                  checked={form.wireguardForm.noKernelTun}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      wireguardForm: {
                        ...f.wireguardForm,
                        noKernelTun: e.target.checked,
                      },
                    }))
                  }
                  label={t("pages.inbounds.wireguardNoKernelTun", {
                    defaultValue: "noKernelTun (userspace; recommended on some hosts)",
                  })}
                />
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor="in-wg-workers"
                  >
                    {t("pages.inbounds.wireguardWorkers", {
                      defaultValue: "Workers (optional)",
                    })}
                  </label>
                  <Input
                    id="in-wg-workers"
                    type="number"
                    className="font-mono text-xs"
                    min={1}
                    placeholder={t("pages.inbounds.wireguardWorkersPlaceholder", {
                      defaultValue: "Leave empty to omit",
                    })}
                    value={form.wireguardForm.workers}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        wireguardForm: {
                          ...f.wireguardForm,
                          workers: e.target.value,
                        },
                      }))
                    }
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--fg-muted)]">
                      {t("pages.inbounds.wireguardPeers", {
                        defaultValue: "Peers (client public keys)",
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => {
                        setForm((f) => {
                          const g = newWireGuardPeerKeypairBase64();
                          const n = 2 + f.wireguardForm.peers.length;
                          return {
                            ...f,
                            wireguardForm: {
                              ...f.wireguardForm,
                              peers: [
                                ...f.wireguardForm.peers,
                                {
                                  publicKey: g.publicKeyB64,
                                  preSharedKey: "",
                                  allowedIps: `10.8.0.${n}/32`,
                                  clientPrivateKey: g.privateKeyB64,
                                },
                              ],
                            },
                          };
                        });
                      }}
                    >
                      {t("pages.inbounds.wireguardAddPeer", {
                        defaultValue: "Add peer",
                      })}
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {form.wireguardForm.peers.length === 0 ? (
                      <p className="text-xs text-[var(--fg-subtle)]">
                        {t("pages.inbounds.wireguardPeersEmpty", {
                          defaultValue: "No peers yet. Add a row for each client public key (optional PSK, allowedIPs).",
                        })}
                      </p>
                    ) : null}
                    {form.wireguardForm.peers.map((row, idx) => (
                      <div
                        key={idx}
                        className="space-y-2 rounded-md border border-[var(--border)] p-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs text-[var(--fg-muted)]">
                            {t("pages.inbounds.wireguardPeerN", {
                              defaultValue: "Peer {{n}}",
                              n: idx + 1,
                            })}
                          </span>
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                wireguardForm: {
                                  ...f.wireguardForm,
                                  peers: f.wireguardForm.peers.filter(
                                    (_p, i) => i !== idx,
                                  ),
                                },
                              }))
                            }
                          >
                            {t("pages.inbounds.wireguardRemovePeer", {
                              defaultValue: "Remove",
                            })}
                          </Button>
                        </div>
                        <Input
                          className="font-mono text-xs"
                          value={row.publicKey}
                          placeholder="publicKey (base64) — on server / [Peer] on client"
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = f.wireguardForm.peers.slice();
                              const cur = next[idx]!;
                              next[idx] = {
                                ...cur,
                                publicKey: v,
                                clientPrivateKey: "",
                              };
                              return {
                                ...f,
                                wireguardForm: { ...f.wireguardForm, peers: next },
                              };
                            });
                          }}
                          spellCheck={false}
                        />
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-2">
                          <div className="min-w-0 flex-1">
                            <label className="mb-0.5 block text-[10px] text-[var(--fg-muted)]">
                              {t("pages.inbounds.wireguardClientPrivate", {
                                defaultValue: "Client private key (for user [Interface] — not sent to Xray)",
                              })}
                            </label>
                            <Input
                              className="font-mono text-xs"
                              value={row.clientPrivateKey ?? ""}
                              placeholder={t("pages.inbounds.wireguardClientPrivatePlaceholder", {
                                defaultValue: "Generated with public key, or paste",
                              })}
                              onChange={(e) => {
                                const v = e.target.value;
                                setForm((f) => {
                                  const next = f.wireguardForm.peers.slice();
                                  const cur = next[idx]!;
                                  next[idx] = { ...cur, clientPrivateKey: v };
                                  return {
                                    ...f,
                                    wireguardForm: { ...f.wireguardForm, peers: next },
                                  };
                                });
                              }}
                              spellCheck={false}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            className="shrink-0 text-xs"
                            onClick={() => {
                              const g = newWireGuardPeerKeypairBase64();
                              setForm((f) => {
                                const next = f.wireguardForm.peers.slice();
                                const cur = next[idx]!;
                                next[idx] = {
                                  ...cur,
                                  publicKey: g.publicKeyB64,
                                  clientPrivateKey: g.privateKeyB64,
                                };
                                return {
                                  ...f,
                                  wireguardForm: { ...f.wireguardForm, peers: next },
                                };
                              });
                            }}
                          >
                            {t("pages.inbounds.wireguardRegenPeerKeys", {
                              defaultValue: "New client keys",
                            })}
                          </Button>
                        </div>
                        <Input
                          className="font-mono text-xs"
                          value={row.preSharedKey}
                          placeholder="preSharedKey (optional)"
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = f.wireguardForm.peers.slice();
                              next[idx] = { ...next[idx]!, preSharedKey: v };
                              return {
                                ...f,
                                wireguardForm: { ...f.wireguardForm, peers: next },
                              };
                            });
                          }}
                          spellCheck={false}
                        />
                        <TextArea
                          className="min-h-[52px] font-mono text-xs"
                          value={row.allowedIps}
                          placeholder="allowedIPs (CIDR, comma or newline)"
                          onChange={(e) => {
                            const v = e.target.value;
                            setForm((f) => {
                              const next = f.wireguardForm.peers.slice();
                              next[idx] = { ...next[idx]!, allowedIps: v };
                              return {
                                ...f,
                                wireguardForm: { ...f.wireguardForm, peers: next },
                              };
                            });
                          }}
                          spellCheck={false}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        wireguardForm: defaultWireguardForm(),
                      }))
                    }
                  >
                    {t("pages.inbounds.wireguardResetDefaults", {
                      defaultValue: "Reset to defaults (new private key)",
                    })}
                  </Button>
                </div>
              </div>
            ) : null}

            {form.protocol !== "vless" &&
            form.protocol !== "trojan" &&
            !isHysteriaFamily &&
            form.protocol !== "shadowsocks" &&
            form.protocol !== "mixed" &&
            form.protocol !== "wireguard" ? (
              <p className="text-xs text-[var(--fg-subtle)]">
                {t("pages.inbounds.sectionAuthNone", {
                  defaultValue:
                    "No protocol-specific secrets on this screen (e.g. VMess uses client UUIDs in settings).",
                })}
              </p>
            ) : null}
            </InboundFormSection>
            ) : null}

            {step === "sniffing" ? (
            <InboundFormSection
              title={t("pages.inbounds.sniffingSection", { defaultValue: "Sniffing" })}
            >
              <CheckboxField
                checked={form.sniffingForm.enabled}
                onChange={(e) =>
                  setSniffingFormField("enabled", e.target.checked)
                }
                label={t("pages.inbounds.sniffingEnabled", { defaultValue: "Enabled" })}
              />
              <p className="mb-2 mt-3 text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.inbounds.sniffingDestOverride", { defaultValue: "Destination override" })}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <CheckboxField
                  checked={form.sniffingForm.destHttp}
                  onChange={(e) =>
                    setSniffingFormField("destHttp", e.target.checked)
                  }
                  label="http"
                />
                <CheckboxField
                  checked={form.sniffingForm.destTls}
                  onChange={(e) =>
                    setSniffingFormField("destTls", e.target.checked)
                  }
                  label="tls"
                />
                <CheckboxField
                  checked={form.sniffingForm.destQuic}
                  onChange={(e) =>
                    setSniffingFormField("destQuic", e.target.checked)
                  }
                  label="quic"
                />
                <CheckboxField
                  checked={form.sniffingForm.destFakedns}
                  onChange={(e) =>
                    setSniffingFormField("destFakedns", e.target.checked)
                  }
                  label="fakedns"
                />
              </div>
            </InboundFormSection>
            ) : null}

            {step === "nodes" && nodes.length > 0 ? (
              <InboundFormSection
                title={t("pages.inbounds.addInboundNodesLabel")}
              >
                <p className="mb-2 text-xs text-[var(--fg-muted)]">
                  {t("pages.inbounds.addInboundNodesHint")}
                </p>
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] p-2">
                  {nodes.map((n) => (
                    <CheckboxField
                      key={n.id}
                      checked={!!nodeIds[n.id]}
                      onChange={(e) =>
                        setNodeIds((m) => ({ ...m, [n.id]: e.target.checked }))
                      }
                      label={`${n.name} (id: ${n.id})`}
                    />
                  ))}
                </div>
              </InboundFormSection>
            ) : null}

            {step === "nodes" && nodes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--fg-subtle)]">
                {t("pages.inbounds.addInboundNodesEmpty", {
                  defaultValue: "No nodes configured yet. Inbound will run on the main server.",
                })}
              </p>
            ) : null}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleteId != null}
        title={t("sure")}
        description={
          deleteId != null
            ? rows.find((x) => x.id === deleteId)?.remark?.trim() || `#${deleteId}`
            : undefined
        }
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        onCancel={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        danger
        loading={deleting}
      />
    </PageScaffold>
  );
}
