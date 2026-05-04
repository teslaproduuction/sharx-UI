"use client";

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Copy,
  HelpCircle,
  Network,
  Plus,
  Trash2,
  WifiOff,
  Zap,
  ZapOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import {
  addressForHostComposeHint,
  buildAddressFromHostPort,
  DEFAULT_NODE_PORT,
  isValidNodePortString,
  parseNodeAddressToHostPort,
} from "@/lib/nodeAddress";
import {
  joinNameFlag,
  NAME_FLAG_SELECT_OPTIONS,
  splitNameFlag,
} from "@/lib/nameFlag";
import { NodeRegisterStep } from "@/components/NodeRegisterStep";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  Button,
  CheckboxField,
  HelpTooltip,
  IconTile,
  Input,
  Modal,
  Reveal,
  SelectNative,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";

/** Pre-`pairing` auth_mode from older DB / API rows. */
const LEGACY_NODE_AUTH_PAIRING = "remna";

type InboundRef = { id?: number; remark?: string };
type ProfileRef = { id?: number; name?: string };

type XrayProfileRow = { id: number; name: string; isDefault?: boolean };

type NodeRow = {
  id: number;
  name: string;
  address: string;
  apiKey?: string;
  authMode?: string;
  status: string;
  lastCheck?: number;
  responseTime?: number;
  useTls?: boolean;
  certPath?: string;
  keyPath?: string;
  insecureTls?: boolean;
  trafficLimitGB?: number;
  inbounds?: InboundRef[];
  profiles?: ProfileRef[];
  xrayVersion?: string;
  /** Worker Xray: running | stopped | error | unknown */
  xrayState?: string;
  /** When false, panel skips health, stats, and config to this node */
  enable?: boolean;
};

type ClientNodeMatrixCell = {
  online?: boolean;
};

type ClientNodeMatrixRow = {
  values?: ClientNodeMatrixCell[];
};

type ClientNodeMatrixCol = {
  id?: number;
};

type ClientNodeMatrixPayload = {
  nodes?: ClientNodeMatrixCol[];
  rows?: ClientNodeMatrixRow[];
};

/** Harbor-style path (same as published images); self-hosters may replace host/project. */
const NODE_DOCKER_IMAGE = "registry.konstpic.ru/sharx/sharxnode:latest";
const REGISTER_HANDSHAKE_PREVIEW_MS = 3500;

// ---------------------------------------------------------------------------
// Status badges — icon + label pill, styled like page section icons
// ---------------------------------------------------------------------------

type NodeStatusBadgeProps = { status: string; t: TFunction };

function NodeStatusBadge({ status, t }: NodeStatusBadgeProps) {
  const s = (status || "unknown").toLowerCase();

  const configs = {
    online: {
      icon: CheckCircle2,
      label: t("pages.nodes.online", { defaultValue: "Online" }),
      dot: "bg-emerald-400",
      text: "text-emerald-300",
    },
    offline: {
      icon: WifiOff,
      label: t("pages.nodes.offline", { defaultValue: "Offline" }),
      dot: "bg-rose-400",
      text: "text-rose-300",
    },
    error: {
      icon: AlertCircle,
      label: t("pages.nodes.error", { defaultValue: "Error" }),
      dot: "bg-rose-400",
      text: "text-rose-300",
    },
    unknown: {
      icon: HelpCircle,
      label: t("pages.nodes.unknown", { defaultValue: "Unknown" }),
      dot: "bg-[var(--fg-subtle)]",
      text: "text-[var(--fg-muted)]",
    },
  } as const;

  const cfg = configs[s as keyof typeof configs] ?? configs.unknown;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <Icon size={13} aria-hidden />
      {cfg.label}
    </span>
  );
}

type XrayStateBadgeProps = { state: string | undefined; t: TFunction };

function XrayStateBadge({ state, t }: XrayStateBadgeProps) {
  const s = (state || "unknown").toLowerCase();

  const configs = {
    running: {
      icon: Zap,
      label: t("pages.nodes.xrayStateRunning", { defaultValue: "Running" }),
      text: "text-emerald-300",
    },
    stopped: {
      icon: ZapOff,
      label: t("pages.nodes.xrayStateStopped", { defaultValue: "Stopped" }),
      text: "text-amber-300",
    },
    error: {
      icon: AlertTriangle,
      label: t("pages.nodes.xrayStateError", { defaultValue: "Error" }),
      text: "text-rose-300",
    },
    unknown: {
      icon: Activity,
      label: t("pages.nodes.xrayStateUnknown", { defaultValue: "Unknown" }),
      text: "text-[var(--fg-muted)]",
    },
  } as const;

  const cfg = configs[s as keyof typeof configs] ?? configs.unknown;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.text}`}>
      <Icon size={13} aria-hidden />
      {cfg.label}
    </span>
  );
}

type PendingRegistration = {
  nodeId: number;
  secretKey?: string;
};

/** Host-network worker: API on port 8080 in the process (default); no port publishing. Self-contained (no .env). */
function buildNodeDockerComposeYaml(secretKey: string, panelUrl: string) {
  const p = panelUrl || "https://your-panel.example";
  return `services:
  node:
    image: ${NODE_DOCKER_IMAGE}
    container_name: sharx-node
    restart: unless-stopped
    cap_add: [NET_ADMIN]
    network_mode: host
    volumes:
      - sharx-node-logs:/app/logs
      - sharx-node-cert:/app/cert
      - sharx-node-data:/app/data
    environment:
      PANEL_URL: ${JSON.stringify(p)}
      SECRET_KEY: ${JSON.stringify(secretKey)}

volumes:
  sharx-node-logs:
  sharx-node-cert:
  sharx-node-data:
`;
}

export function NodesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const ws = usePanelWebSocket();
  const resyncAfterDisconnect = useRef(false);
  const [rows, setRows] = useState<NodeRow[]>([]);
  const [onlineUsersByNode, setOnlineUsersByNode] = useState<Record<number, number>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [xrayStateFilter, setXrayStateFilter] = useState("all");

  const [addOpen, setAddOpen] = useState(false);
  const [addWizardStep, setAddWizardStep] = useState<1 | 2 | 3>(1);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerPhase, setRegisterPhase] = useState<"create" | "verify">(
    "create",
  );
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerFailKind, setRegisterFailKind] = useState<
    "add" | "check" | null
  >(null);
  const [pendingReg, setPendingReg] = useState<PendingRegistration | null>(
    null,
  );
  const [createdSecretKey, setCreatedSecretKey] = useState<string | null>(null);
  // Panel-wide pairing secret: same for every node, fetched once on modal open.
  const [panelSecretKey, setPanelSecretKey] = useState<string | null>(null);
  const [panelSecretLoading, setPanelSecretLoading] = useState(false);
  const [panelOrigin, setPanelOrigin] = useState("");

  const [multiNode, setMultiNode] = useState<boolean | null>(null);
  const [profileList, setProfileList] = useState<XrayProfileRow[]>([]);
  const [profileListLoading, setProfileListLoading] = useState(false);
  const [profileAssignNodeId, setProfileAssignNodeId] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [profileAssignSubmitting, setProfileAssignSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<NodeRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [form, setForm] = useState({
    nameFlag: "",
    name: "",
    host: "",
    port: DEFAULT_NODE_PORT,
    useTls: false,
    certPath: "",
    keyPath: "",
    insecureTls: false,
    trafficLimitGB: "0",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [togglingEnableId, setTogglingEnableId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    nameFlag: "",
    host: "",
    port: DEFAULT_NODE_PORT,
    trafficLimitGB: "0",
    enable: true,
    useTls: false,
    certPath: "",
    keyPath: "",
    insecureTls: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<NodeRow[]>(panel("node/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) {
      setRows(r.obj as NodeRow[]);
    } else {
      setRows([]);
      if (!r.success) {
        toast.error(t("pages.nodes.loadError"));
      }
    }
  }, [t, toast]);

  const loadOnlineUsersByNode = useCallback(async () => {
    const r = await getJson<ClientNodeMatrixPayload>(panel("node/client-traffic-per-node"));
    if (!r.success || !r.obj) {
      setOnlineUsersByNode({});
      return;
    }
    const payload = r.obj as ClientNodeMatrixPayload;
    const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
    const matrixRows = Array.isArray(payload.rows) ? payload.rows : [];
    const counts: Record<number, number> = {};
    nodes.forEach((node, idx) => {
      if (typeof node.id === "number") {
        counts[node.id] = matrixRows.reduce((acc, row) => {
          const cell = Array.isArray(row.values) ? row.values[idx] : undefined;
          return acc + (cell?.online ? 1 : 0);
        }, 0);
      }
    });
    setOnlineUsersByNode(counts);
  }, []);

  useEffect(() => {
    void load();
    void loadOnlineUsersByNode();
  }, [load, loadOnlineUsersByNode]);

  const loadMultiNode = useCallback(async () => {
    const s = await postJson<Record<string, unknown>>(panel("setting/all"));
    if (s.success && s.obj) {
      setMultiNode(Boolean((s.obj as { multiNodeMode?: boolean }).multiNodeMode));
    }
  }, []);

  useEffect(() => {
    void loadMultiNode();
  }, [loadMultiNode]);

  useEffect(() => {
    if (!ws) return;
    const onNodes = (p: unknown) => {
      if (!Array.isArray(p)) return;
      setRows(p as NodeRow[]);
    };
    const onDisc = () => {
      resyncAfterDisconnect.current = true;
    };
    const onConn = () => {
      if (resyncAfterDisconnect.current) {
        resyncAfterDisconnect.current = false;
        void load();
        void loadOnlineUsersByNode();
      }
    };
    const onClientMatrix = (p: unknown) => {
      if (!p || typeof p !== "object") return;
      const payload = p as ClientNodeMatrixPayload;
      const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
      const matrixRows = Array.isArray(payload.rows) ? payload.rows : [];
      const counts: Record<number, number> = {};
      nodes.forEach((node, idx) => {
        if (typeof node.id === "number") {
          counts[node.id] = matrixRows.reduce((acc, row) => {
            const cell = Array.isArray(row.values) ? row.values[idx] : undefined;
            return acc + (cell?.online ? 1 : 0);
          }, 0);
        }
      });
      setOnlineUsersByNode(counts);
    };
    ws.on("nodes", onNodes);
    ws.on("client_traffic_per_node", onClientMatrix);
    ws.on("disconnected", onDisc);
    ws.on("connected", onConn);
    return () => {
      ws.off("nodes", onNodes);
      ws.off("client_traffic_per_node", onClientMatrix);
      ws.off("disconnected", onDisc);
      ws.off("connected", onConn);
    };
  }, [ws, load, loadOnlineUsersByNode]);

  const resetAddModal = useCallback(() => {
    setAddWizardStep(1);
    setIsRegistering(false);
    setRegisterPhase("create");
    setRegisterError(null);
    setRegisterFailKind(null);
    setPendingReg(null);
    setForm({
      nameFlag: "",
      name: "",
      host: "",
      port: DEFAULT_NODE_PORT,
      useTls: false,
      certPath: "",
      keyPath: "",
      insecureTls: false,
      trafficLimitGB: "0",
    });
    setCreatedSecretKey(null);
    setProfileList([]);
    setProfileListLoading(false);
    setProfileAssignNodeId(null);
    setSelectedProfileId(null);
    setProfileAssignSubmitting(false);
  }, []);

  const loadProfilesForAssign = useCallback(async () => {
    setProfileListLoading(true);
    const r = await getJson<XrayProfileRow[]>(panel("xray-core-config-profile/list"));
    setProfileListLoading(false);
    if (r.success && Array.isArray(r.obj)) {
      const list = r.obj;
      setProfileList(list);
      const def = list.find((p) => p.isDefault) ?? list[0];
      setSelectedProfileId(def ? def.id : null);
    } else {
      setProfileList([]);
      setSelectedProfileId(null);
    }
  }, []);

  const loadPanelSecret = useCallback(async () => {
    if (panelSecretKey) return;
    setPanelSecretLoading(true);
    try {
      const r = await getJson<{ secretKey?: string }>(panel("node/secret"));
      if (r.success && r.obj?.secretKey) {
        setPanelSecretKey(r.obj.secretKey);
      }
    } finally {
      setPanelSecretLoading(false);
    }
  }, [panelSecretKey]);

  const openAdd = () => {
    resetAddModal();
    if (typeof window !== "undefined") {
      setPanelOrigin(window.location.origin);
    }
    setAddOpen(true);
    void loadPanelSecret();
    void loadMultiNode();
  };

  const closeAdd = () => {
    if (isRegistering || profileAssignSubmitting) return;
    setAddOpen(false);
    resetAddModal();
  };


  const getAddBody = useCallback(():
    | { name: string; address: string; body: Record<string, unknown> }
    | null => {
    const name = joinNameFlag(form.nameFlag, form.name.trim());
    if (!isValidNodePortString(form.port)) return null;
    const address = buildAddressFromHostPort(form.host, form.port, {
      useTls: form.useTls,
    });
    if (!name || !address) return null;
    const trafficLimitGB = Number(form.trafficLimitGB);
    const tl =
      Number.isFinite(trafficLimitGB) && trafficLimitGB >= 0
        ? trafficLimitGB
        : 0;
    const body: Record<string, unknown> = {
      name,
      address,
      useTls: form.useTls,
      certPath: form.certPath.trim(),
      keyPath: form.keyPath.trim(),
      insecureTls: form.insecureTls,
    };
    if (tl > 0) {
      body.trafficLimitGB = tl;
    }
    return { name, address, body };
  }, [form]);

  const runRegisterRef = useRef<
    (checkOnly: boolean) => Promise<void>
  >(async () => {});

  const wait = useCallback(
    (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms)),
    [],
  );

  const runRegisterFlow = useCallback(
    async (checkOnly: boolean) => {
      if (checkOnly && !pendingReg) return;
      setIsRegistering(true);
      setRegisterError(null);
      setRegisterFailKind(null);
      setRegisterPhase("create");

      let stash: PendingRegistration | null =
        checkOnly && pendingReg ? { ...pendingReg } : null;

      try {
        if (!checkOnly) {
          const pack = getAddBody();
          if (!pack) {
            setRegisterFailKind("add");
            setRegisterError(t("pages.nodes.addError"));
            return;
          }
          const r = await postJson<NodeRow & { secretKey?: string }>(
            panel("node/add"),
            pack.body,
            true,
          );
          if (!r.success || !r.obj) {
            setRegisterFailKind("add");
            setRegisterError(
              (r as { msg?: string }).msg || t("pages.nodes.addError"),
            );
            return;
          }
          const obj = r.obj as NodeRow & { secretKey?: string };
          stash = {
            nodeId: obj.id,
            secretKey: obj.secretKey?.trim() || undefined,
          };
          setPendingReg(stash);
        } else {
          if (!pendingReg) return;
          stash = { ...pendingReg };
        }

        if (!stash) return;

        {
          const sk0 = stash.secretKey?.trim() ?? "";
          if (sk0) {
            setCreatedSecretKey(sk0);
          }
        }
        if (typeof window !== "undefined") {
          setPanelOrigin((prev) => prev || window.location.origin);
        }

        setRegisterPhase("verify");
        await wait(REGISTER_HANDSHAKE_PREVIEW_MS);
        const checkR = await postJson<unknown>(
          panel(`node/check/${stash.nodeId}`),
          {},
          true,
        );
        if (!checkR.success) {
          setRegisterFailKind("check");
          setRegisterError(
            (checkR as { msg?: string }).msg || t("pages.nodes.checkError"),
          );
          return;
        }

        if (multiNode === true) {
          setProfileAssignNodeId(stash.nodeId);
          setPendingReg(null);
          setAddWizardStep(3);
          void load();
          toast.success(t("pages.nodes.addSuccess"));
          void loadProfilesForAssign();
          return;
        }

        const sk = stash.secretKey?.trim() ?? "";
        if (!sk) {
          setPendingReg(null);
          setAddOpen(false);
          resetAddModal();
          void load();
          toast.success(t("pages.nodes.addSuccess"));
          return;
        }
        setPendingReg(null);
        void load();
        setAddOpen(false);
        resetAddModal();
        toast.success(t("pages.nodes.addSuccess"));
      } catch {
        setRegisterError(t("pages.nodes.addError"));
        setRegisterFailKind(checkOnly ? "check" : "add");
      } finally {
        setIsRegistering(false);
      }
    },
    [
      getAddBody,
      pendingReg,
      t,
      toast,
      load,
      resetAddModal,
      multiNode,
      loadProfilesForAssign,
      wait,
    ],
  );

  runRegisterRef.current = runRegisterFlow;

  const goToRegister = useCallback(() => {
    if (!isValidNodePortString(form.port)) {
      toast.error(t("pages.nodes.validPort"));
      return;
    }
    if (!form.host.trim()) {
      toast.error(t("pages.nodes.enterNodeAddress"));
      return;
    }
    const pack = getAddBody();
    if (!pack) {
      if (!joinNameFlag(form.nameFlag, form.name.trim())) {
        toast.error(t("pages.nodes.enterNodeName"));
        return;
      }
      toast.error(t("pages.nodes.enterNodeAddress"));
      return;
    }
    if (typeof window !== "undefined") {
      setPanelOrigin(window.location.origin);
    }
    setForm((f) => ({
      ...f,
      ...parseNodeAddressToHostPort(pack.address),
    }));
    setAddWizardStep(2);
    setRegisterError(null);
    setRegisterFailKind(null);
    const checkOnly = Boolean(pendingReg);
    setTimeout(() => {
      void runRegisterRef.current(checkOnly);
    }, 0);
  }, [getAddBody, form.name, form.nameFlag, form.host, form.port, pendingReg, t, toast]);

  const backToFormStep = useCallback(() => {
    if (isRegistering) return;
    setAddWizardStep(1);
  }, [isRegistering]);

  const retryRegister = useCallback(() => {
    if (isRegistering) return;
    void runRegisterRef.current(registerFailKind === "check");
  }, [isRegistering, registerFailKind]);

  const clearDraftFromFormEdit = useCallback(() => {
    setPendingReg(null);
    setCreatedSecretKey(null);
  }, []);

  const deleteDraftNode = useCallback(async () => {
    if (!pendingReg?.nodeId) return;
    setDraftDeleteBusy(true);
    try {
      const r = await postJson(panel(`node/del/${pendingReg.nodeId}`), {}, true);
      if (r.success) {
        toast.success(t("pages.nodes.deleteSuccess"));
        setPendingReg(null);
        setCreatedSecretKey(null);
        setRegisterError(null);
        setRegisterFailKind(null);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.nodes.deleteError"),
        );
      }
    } catch {
      toast.error(t("pages.nodes.deleteError"));
    } finally {
      setDraftDeleteBusy(false);
    }
  }, [pendingReg, t, toast, load]);

  const publicUrlHint = useMemo(() => {
    if (!isValidNodePortString(form.port)) return "";
    const combined = buildAddressFromHostPort(form.host, form.port, {
      useTls: form.useTls,
    });
    if (!combined) return "";
    return addressForHostComposeHint(combined, {
      useTls: form.useTls,
    });
  }, [form.host, form.port, form.useTls]);

  const addModalTitle = useMemo(() => {
    if (addWizardStep === 2) return t("pages.nodes.wizardRegisterTitle");
    if (addWizardStep === 3) {
      return t("pages.nodes.wizardProfileTitle", {
        defaultValue: "Xray profile for this node",
      });
    }
    return t("pages.nodes.wizardFormTitle");
  }, [addWizardStep, t]);

  const submitProfileAssign = useCallback(async () => {
    if (selectedProfileId == null || profileAssignNodeId == null) {
      toast.error(
        t("pages.nodes.selectProfileError", { defaultValue: "Select a profile" }),
      );
      return;
    }
    setProfileAssignSubmitting(true);
    const r = await postJson(
      panel(`xray-core-config-profile/assign-nodes/${selectedProfileId}`),
      { nodeIds: [profileAssignNodeId] },
      true,
    );
    setProfileAssignSubmitting(false);
    if (r.success) {
      toast.success(r.msg || t("success"));
      setAddOpen(false);
      resetAddModal();
      void load();
    } else {
      toast.error((r as { msg?: string }).msg || t("fail"));
    }
  }, [selectedProfileId, profileAssignNodeId, t, toast, load, resetAddModal]);

  const skipProfileStep = useCallback(() => {
    setAddOpen(false);
    resetAddModal();
  }, [resetAddModal]);

  const backToRegisterStep = useCallback(() => {
    if (profileAssignSubmitting) return;
    setAddWizardStep(2);
  }, [profileAssignSubmitting]);

  const copyDockerCompose = async () => {
    if (!createdSecretKey) return;
    try {
      const yaml = buildNodeDockerComposeYaml(createdSecretKey, panelOrigin);
      await copyTextToClipboard(yaml);
      toast.success(t("copied"));
    } catch {
      toast.error(t("pages.nodes.copyError"));
    }
  };

  const copyPanelCompose = async () => {
    if (!panelSecretKey) return;
    try {
      const yaml = buildNodeDockerComposeYaml(panelSecretKey, panelOrigin);
      await copyTextToClipboard(yaml);
      toast.success(t("copied"));
    } catch {
      toast.error(t("pages.nodes.copyError"));
    }
  };

  const confirmDeleteNode = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const r = await postJson(
        panel(`node/del/${deleteTarget.id}`),
        {},
        true,
      );
      if (r.success) {
        toast.success(t("pages.nodes.deleteSuccess"));
        setDeleteTarget(null);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.nodes.deleteError"),
        );
      }
    } catch {
      toast.error(t("pages.nodes.deleteError"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const patchNodeEnable = useCallback(
    async (row: NodeRow, next: boolean) => {
      setTogglingEnableId(row.id);
      try {
        const r = await postJson(panel(`node/update/${row.id}`), { enable: next }, true);
        if (r.success) {
          setRows((prev) =>
            prev.map((x) => (x.id === row.id ? { ...x, enable: next } : x)),
          );
        } else {
          toast.error(
            (r as { msg?: string }).msg || t("pages.nodes.updateError"),
          );
        }
      } catch {
        toast.error(t("pages.nodes.updateError"));
      } finally {
        setTogglingEnableId(null);
      }
    },
    [t, toast],
  );

  const openEdit = async (row: NodeRow) => {
    setEditId(row.id);
    const fromRow = parseNodeAddressToHostPort(row.address);
    const fromName = splitNameFlag(row.name);
    setEditForm({
      name: fromName.text,
      nameFlag: fromName.flag,
      host: fromRow.host,
      port: fromRow.port,
      trafficLimitGB: String(
        row.trafficLimitGB != null && row.trafficLimitGB > 0
          ? row.trafficLimitGB
          : 0,
      ),
      enable: row.enable !== false,
      useTls: Boolean(row.useTls),
      certPath: row.certPath ?? "",
      keyPath: row.keyPath ?? "",
      insecureTls: Boolean(row.insecureTls),
    });
    const r = await getJson<NodeRow>(panel(`node/get/${row.id}`));
    if (r.success && r.obj && typeof r.obj === "object") {
      const o = r.obj as NodeRow;
      const parsed = parseNodeAddressToHostPort(o.address);
      const sp = splitNameFlag(o.name);
      setEditForm((f) => ({
        ...f,
        name: sp.text,
        nameFlag: sp.flag,
        host: parsed.host,
        port: parsed.port,
        trafficLimitGB: String(
          o.trafficLimitGB != null && o.trafficLimitGB > 0
            ? o.trafficLimitGB
            : 0,
        ),
        enable: o.enable !== false,
        useTls: Boolean(o.useTls),
        certPath: o.certPath ?? "",
        keyPath: o.keyPath ?? "",
        insecureTls: Boolean(o.insecureTls),
      }));
    }
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (!editSubmitting) {
      setEditOpen(false);
      setEditId(null);
    }
  };

  const submitEdit = async () => {
    if (editId == null) return;
    const name = joinNameFlag(editForm.nameFlag, editForm.name.trim());
    if (!name) {
      toast.error(t("pages.nodes.enterNodeName"));
      return;
    }
    if (!isValidNodePortString(editForm.port)) {
      toast.error(t("pages.nodes.validPort"));
      return;
    }
    if (!editForm.host.trim()) {
      toast.error(t("pages.nodes.enterNodeAddress"));
      return;
    }
    const address = buildAddressFromHostPort(
      editForm.host,
      editForm.port,
      {
        useTls: editForm.useTls,
      },
    );
    if (!address) {
      toast.error(t("pages.nodes.enterNodeAddress"));
      return;
    }
    const trafficLimitGB = Number(editForm.trafficLimitGB);
    const tl =
      Number.isFinite(trafficLimitGB) && trafficLimitGB >= 0
        ? trafficLimitGB
        : 0;

    setEditSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name,
        address,
        enable: editForm.enable,
        useTls: editForm.useTls,
        certPath: editForm.certPath.trim(),
        keyPath: editForm.keyPath.trim(),
        insecureTls: editForm.insecureTls,
        trafficLimitGB: tl,
      };
      const r = await postJson(panel(`node/update/${editId}`), body, true);
      if (r.success) {
        toast.success(
          (r as { msg?: string }).msg || t("pages.nodes.updateSuccess"),
        );
        setEditOpen(false);
        setEditId(null);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.nodes.updateError"),
        );
      }
    } catch {
      toast.error(t("pages.nodes.updateError"));
    } finally {
      setEditSubmitting(false);
    }
  };

  const authModeLabel = (m?: string) => {
    const k = (m ?? "legacy").toLowerCase();
    if (k === "pairing" || k === LEGACY_NODE_AUTH_PAIRING)
      return t("pages.nodes.authPairing");
    return t("pages.nodes.authLegacy");
  };

  const sortedAndFilteredRows = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    const byId = [...rows].sort((a, b) => {
      if (a.id !== b.id) return a.id - b.id;
      return a.name.localeCompare(b.name);
    });
    return byId.filter((r) => {
      if (q) {
        const name = (r.name || "").toLowerCase();
        const address = (r.address || "").toLowerCase();
        if (!name.includes(q) && !address.includes(q)) return false;
      }
      if (statusFilter !== "all") {
        const status = (r.status || "unknown").toLowerCase();
        if (status !== statusFilter) return false;
      }
      if (xrayStateFilter !== "all") {
        const xstate = (r.xrayState || "unknown").toLowerCase();
        if (xstate !== xrayStateFilter) return false;
      }
      return true;
    });
  }, [rows, nameFilter, statusFilter, xrayStateFilter]);

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.nodes.title")}
        icon={Network}
        iconTone="success"
        actions={
          <>
            <Button variant="secondary" onClick={openAdd} className="!gap-2">
              <Plus size={16} />
              {t("pages.nodes.addNode")}
            </Button>
          </>
        }
      />
      <Reveal>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="grid min-h-48 place-content-center gap-4 px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
            <div className="flex flex-col items-center gap-3">
              <IconTile icon={Network} tone="neutral" size="lg" />
              <p>{t("noData")}</p>
            </div>
            <div>
              <Button variant="primary" onClick={openAdd} className="!gap-2">
                <Plus size={16} />
                {t("pages.nodes.addNode")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-2 px-3 pt-3 sm:grid-cols-[1fr,11rem,11rem]">
              <Input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder={t("pages.nodes.search", {
                  defaultValue: "Search by name or address",
                })}
              />
              <SelectNative
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">
                  {t("pages.nodes.filterAllStatuses", {
                    defaultValue: "All statuses",
                  })}
                </option>
                <option value="online">{t("pages.nodes.online")}</option>
                <option value="offline">{t("pages.nodes.offline")}</option>
                <option value="unknown">{t("pages.nodes.unknown")}</option>
                <option value="error">{t("pages.nodes.error", { defaultValue: "Error" })}</option>
              </SelectNative>
              <SelectNative
                value={xrayStateFilter}
                onChange={(e) => setXrayStateFilter(e.target.value)}
              >
                <option value="all">
                  {t("pages.nodes.filterAllXrayStates", {
                    defaultValue: "All Xray states",
                  })}
                </option>
                <option value="running">
                  {t("pages.nodes.xrayStateRunning", { defaultValue: "Running" })}
                </option>
                <option value="stopped">
                  {t("pages.nodes.xrayStateStopped", { defaultValue: "Stopped" })}
                </option>
                <option value="error">
                  {t("pages.nodes.xrayStateError", { defaultValue: "Error" })}
                </option>
                <option value="unknown">
                  {t("pages.nodes.xrayStateUnknown", { defaultValue: "Unknown" })}
                </option>
              </SelectNative>
            </div>
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th
                    className="w-14 p-3"
                    scope="col"
                    aria-label={t("pages.nodes.nodeEnabled")}
                  />
                  <th className="p-3">{t("pages.nodes.name")}</th>
                  <th className="p-3">{t("pages.nodes.address")}</th>
                  <th className="p-3">{t("pages.nodes.authMode")}</th>
                  <th className="p-3">{t("pages.nodes.status")}</th>
                  <th className="p-3">
                    {t("pages.nodes.onlineUsers", { defaultValue: "Online users" })}
                  </th>
                  <th className="p-3">{t("pages.nodes.responseTime")}</th>
                  <th className="p-3">{t("pages.nodes.xrayVersion")}</th>
                  <th className="p-3">{t("pages.nodes.xrayState")}</th>
                  <th className="p-3">{t("pages.nodes.assignedInbounds")}</th>
                  <th className="p-3 w-20">{t("pages.nodes.operate")}</th>
                </tr>
              </thead>
              <tbody>
                {sortedAndFilteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="p-6 text-center text-sm text-[var(--fg-subtle)]"
                    >
                      {t("pages.nodes.noMatches", { defaultValue: "No nodes match filters" })}
                    </td>
                  </tr>
                ) : sortedAndFilteredRows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className={`border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] ${
                      r.enable === false ? "opacity-[0.7]" : ""
                    } cursor-pointer`}
                    onClick={() => void openEdit(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openEdit(r);
                      }
                    }}
                  >
                    <td
                      className="p-3 w-14"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        size="sm"
                        checked={r.enable !== false}
                        disabled={togglingEnableId === r.id}
                        ariaLabel={t("pages.nodes.nodeEnabled")}
                        onChange={(next) => {
                          void patchNodeEnable(r, next);
                        }}
                      />
                    </td>
                    <td className="p-3 text-[var(--fg)]">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.address}</td>
                    <td className="p-3 text-xs">{authModeLabel(r.authMode)}</td>
                    <td className="p-3">
                      <NodeStatusBadge status={r.status} t={t} />
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {onlineUsersByNode[r.id] ?? 0}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {r.responseTime != null && r.responseTime > 0
                        ? `${r.responseTime} ms`
                        : "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {r.xrayVersion || "—"}
                    </td>
                    <td className="p-3">
                      <XrayStateBadge state={r.xrayState} t={t} />
                    </td>
                    <td className="p-3 max-w-[220px] text-xs">
                      {!r.inbounds?.length
                        ? "—"
                        : r.inbounds
                            .map(
                              (ib) =>
                                ib.remark ||
                                (ib.id != null ? `#${ib.id}` : "—"),
                            )
                            .join(", ")}
                    </td>
                    <td
                      className="p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!p-1.5 text-[var(--fg-muted)] hover:text-[var(--danger)]"
                          onClick={() => setDeleteTarget(r)}
                          title={t("pages.nodes.deleteNode")}
                          aria-label={t("pages.nodes.deleteNode")}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </Surface>
      </Reveal>

      <Modal
        open={addOpen}
        onClose={() => {
          if (isRegistering || profileAssignSubmitting) return;
          closeAdd();
        }}
        closable={!isRegistering && !profileAssignSubmitting}
        title={addModalTitle}
        width={
          addWizardStep === 2 && createdSecretKey
            ? 640
            : addWizardStep === 3
              ? 520
              : 580
        }
        footer={(() => {
          if (addWizardStep === 3) {
            return (
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={profileAssignSubmitting}
                  onClick={backToRegisterStep}
                >
                  {t("back")}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={profileAssignSubmitting}
                  onClick={skipProfileStep}
                >
                  {t("pages.nodes.skipProfile", { defaultValue: "Skip" })}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={profileAssignSubmitting}
                  disabled={profileAssignSubmitting}
                  onClick={() => void submitProfileAssign()}
                >
                  {t("pages.nodes.assignProfileDone", {
                    defaultValue: "Assign and close",
                  })}
                </Button>
              </div>
            );
          }
          if (addWizardStep === 2) {
            if (registerError && !isRegistering) {
              return (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={backToFormStep}
                  >
                    {t("pages.nodes.backToEdit")}
                  </Button>
                  {createdSecretKey ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!gap-2"
                      onClick={() => void copyDockerCompose()}
                    >
                      <Copy size={16} />
                      {t("pages.nodes.copyDockerCompose")}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="primary"
                    onClick={retryRegister}
                  >
                    {t("pages.nodes.retry")}
                  </Button>
                </div>
              );
            }
            if (isRegistering) {
              return (
                <div className="flex min-h-10 flex-wrap items-center justify-end gap-2">
                  {createdSecretKey ? (
                    <Button
                      type="button"
                      variant="primary"
                      className="!gap-2"
                      onClick={() => void copyDockerCompose()}
                    >
                      <Copy size={16} />
                      {t("pages.nodes.copyDockerCompose")}
                    </Button>
                  ) : null}
                  <span className="text-xs text-[var(--fg-subtle)]">
                    {t("pages.nodes.registerInProgress")}
                  </span>
                </div>
              );
            }
            return (
              <div className="flex flex-wrap justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={backToFormStep}
                >
                  {t("pages.nodes.backToEdit")}
                </Button>
              </div>
            );
          }
          return (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={isRegistering}
                onClick={closeAdd}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={isRegistering}
                onClick={goToRegister}
              >
                {t("pages.nodes.addWizardNext")}
              </Button>
            </div>
          );
        })()}
      >
        {addWizardStep === 3 ? (
          <div className="flex flex-col gap-4 text-sm">
            <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
              {t("pages.nodes.wizardProfileHint")}
            </p>
            {profileListLoading ? (
              <div className="grid min-h-32 place-items-center">
                <Spinner size={32} />
              </div>
            ) : profileList.length === 0 ? (
              <p className="text-sm text-[var(--fg-subtle)]">
                {t("pages.nodes.wizardProfileEmpty")}
              </p>
            ) : (
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1" role="radiogroup">
                {profileList.map((pr) => (
                  <label
                    key={pr.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      selectedProfileId === pr.id
                        ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                        : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-[var(--fg-subtle)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="node-xray-profile"
                      className="shrink-0"
                      checked={selectedProfileId === pr.id}
                      onChange={() => setSelectedProfileId(pr.id)}
                    />
                    <span className="min-w-0 font-medium text-[var(--fg)]">
                      {pr.name}
                      {pr.isDefault
                        ? ` ${t("pages.nodes.profileDefaultTag")}`
                        : ""}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : addWizardStep === 2 ? (
          <div className="flex flex-col gap-4 text-sm">
            {createdSecretKey ? (
              <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)] p-3">
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.registerStepDeployHint")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="!gap-2"
                    onClick={() => void copyDockerCompose()}
                  >
                    <Copy size={16} />
                    {t("pages.nodes.copyDockerCompose")}
                  </Button>
                </div>
              </div>
            ) : null}
            <p className="text-center text-xs text-[var(--fg-muted)]">
              {t("pages.nodes.registerFlowHint")}
            </p>
            <NodeRegisterStep
              phase={registerPhase}
              isError={Boolean(registerError) && !isRegistering}
            />
            {registerError && !isRegistering ? (
              <p className="text-center text-sm text-[var(--danger)]">
                {t("pages.nodes.registerFail")}: {registerError}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-xs text-[var(--fg-subtle)]">
              {t("pages.nodes.fullUrlHint")}
            </p>
            {pendingReg ? (
              <div className="rounded-md border border-[var(--border)] bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] p-3">
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.draftPendingHint")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!px-3 !py-1.5 !text-xs"
                    onClick={() => {
                      setAddWizardStep(2);
                      setRegisterError(null);
                      setRegisterFailKind(null);
                      setTimeout(
                        () => void runRegisterRef.current(true),
                        0,
                      );
                    }}
                  >
                    {t("pages.nodes.draftVerifyAgain")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="!px-3 !py-1.5 !text-xs !text-[var(--danger)] hover:!bg-[color-mix(in_oklab,var(--danger)_12%,transparent)]"
                    loading={draftDeleteBusy}
                    disabled={draftDeleteBusy}
                    onClick={() => void deleteDraftNode()}
                  >
                    {t("pages.nodes.draftDelete")}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-md border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)] p-3">
              <p className="mb-1 text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.nodes.composeFirstStepTitle")}
              </p>
              <p className="mb-2 text-[11px] text-[var(--fg-subtle)]">
                {t("pages.nodes.composeFirstStepDesc")}
              </p>
              <Button
                type="button"
                variant="primary"
                className="!gap-2"
                disabled={!panelSecretKey}
                loading={panelSecretLoading && !panelSecretKey}
                onClick={() => void copyPanelCompose()}
              >
                <Copy size={16} />
                {t("pages.nodes.copyDockerCompose")}
              </Button>
            </div>
            {publicUrlHint ? (
              <p className="text-[11px] text-[var(--fg-subtle)]">
                {t("pages.nodes.hostUrlNoPortHint", { url: publicUrlHint })}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="w-full shrink-0 sm:max-w-[7.5rem]">
                <label
                  className="mb-1.5 block text-xs text-[var(--fg-muted)]"
                  htmlFor="node-name-flag"
                >
                  {t("pages.nodes.country")}
                </label>
                <SelectNative
                  id="node-name-flag"
                  value={form.nameFlag}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({ ...f, nameFlag: e.target.value }));
                  }}
                >
                  {NAME_FLAG_SELECT_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <label className="min-w-0 flex-1 grid gap-1">
                <span className="text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.nodeName")}
                </span>
                <Input
                  value={form.name}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({ ...f, name: e.target.value }));
                  }}
                />
              </label>
            </div>
            <div className="grid gap-1 sm:grid-cols-[1fr,6.5rem] sm:items-end sm:gap-3">
              <label className="grid min-w-0 gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.nodeHost")}
                  <HelpTooltip helpKey="nodes.address" />
                </span>
                <Input
                  value={form.host}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({ ...f, host: e.target.value }));
                  }}
                  placeholder="node.example.com"
                />
              </label>
              <label className="grid gap-1">
                <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.nodePort")}
                  <HelpTooltip helpKey="nodes.port" />
                </span>
                <Input
                  value={form.port}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({ ...f, port: e.target.value }));
                  }}
                  inputMode="numeric"
                  placeholder={DEFAULT_NODE_PORT}
                />
              </label>
            </div>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.nodes.authPairingDescription")}
            </p>
            <label className="grid gap-1">
              <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.trafficLimitGB")}
                <HelpTooltip helpKey="nodes.trafficLimit" />
              </span>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.trafficLimitGB}
                onChange={(e) => {
                  clearDraftFromFormEdit();
                  setForm((f) => ({ ...f, trafficLimitGB: e.target.value }));
                }}
              />
              <span className="text-[11px] text-[var(--fg-subtle)]">
                {t("pages.nodes.trafficLimitGBHint")}
              </span>
            </label>
            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.nodes.tlsSettings")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <CheckboxField
                  label={t("pages.nodes.useTls")}
                  checked={form.useTls}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({ ...f, useTls: e.target.checked }));
                  }}
                />
                <CheckboxField
                  label={t("pages.nodes.insecureTls")}
                  checked={form.insecureTls}
                  onChange={(e) => {
                    clearDraftFromFormEdit();
                    setForm((f) => ({
                      ...f,
                      insecureTls: e.target.checked,
                    }));
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={t("pages.nodes.editNode")}
        width={640}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={editSubmitting}
              onClick={closeEdit}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              type="button"
              loading={editSubmitting}
              onClick={() => void submitEdit()}
            >
              {t("update")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--fg)_4%,transparent)] px-3 py-2.5">
            <span className="text-sm font-medium text-[var(--fg)]">
              {t("pages.nodes.nodeEnabled")}
            </span>
            <Switch
              checked={editForm.enable}
              onChange={(next) =>
                setEditForm((f) => ({ ...f, enable: next }))
              }
              ariaLabel={t("pages.nodes.nodeEnabled")}
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full shrink-0 sm:max-w-[7.5rem]">
              <label
                className="mb-1.5 block text-xs text-[var(--fg-muted)]"
                htmlFor="edit-node-name-flag"
              >
                {t("pages.nodes.country")}
              </label>
              <SelectNative
                id="edit-node-name-flag"
                value={editForm.nameFlag}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, nameFlag: e.target.value }))
                }
              >
                {NAME_FLAG_SELECT_OPTIONS.map((o) => (
                  <option key={o.value || "none"} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </SelectNative>
            </div>
            <label className="min-w-0 flex-1 grid gap-1">
              <span className="text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.nodeName")}
              </span>
              <Input
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="grid gap-1 sm:grid-cols-[1fr,6.5rem] sm:items-end sm:gap-3">
            <label className="grid min-w-0 gap-1">
              <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.nodeHost")}
                <HelpTooltip helpKey="nodes.address" />
              </span>
              <Input
                value={editForm.host}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, host: e.target.value }))
                }
              />
            </label>
            <label className="grid gap-1">
              <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.nodePort")}
                <HelpTooltip helpKey="nodes.port" />
              </span>
              <Input
                value={editForm.port}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, port: e.target.value }))
                }
                inputMode="numeric"
                placeholder={DEFAULT_NODE_PORT}
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
              {t("pages.nodes.trafficLimitGB")}
              <HelpTooltip helpKey="nodes.trafficLimit" />
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={editForm.trafficLimitGB}
              onChange={(e) =>
                setEditForm((f) => ({
                  ...f,
                  trafficLimitGB: e.target.value,
                }))
              }
            />
          </label>
          <p className="text-[11px] text-[var(--fg-subtle)]">
            {t("pages.nodes.editPairingNote")}
          </p>
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.nodes.tlsSettings")}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <CheckboxField
                label={t("pages.nodes.useTls")}
                checked={editForm.useTls}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, useTls: e.target.checked }))
                }
              />
              <CheckboxField
                label={t("pages.nodes.insecureTls")}
                checked={editForm.insecureTls}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    insecureTls: e.target.checked,
                  }))
                }
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (deleteSubmitting) return;
          setDeleteTarget(null);
        }}
        closable={!deleteSubmitting}
        title={t("pages.nodes.deleteConfirm")}
        width={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={deleteSubmitting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteSubmitting}
              onClick={() => void confirmDeleteNode()}
            >
              {t("pages.nodes.deleteNode")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--fg-muted)]">
          {t("pages.nodes.deleteConfirmText")}
        </p>
        {deleteTarget ? (
          <p className="mt-2 font-mono text-xs text-[var(--fg)]">
            {deleteTarget.name} — {deleteTarget.address}
          </p>
        ) : null}
      </Modal>
    </PageScaffold>
  );
}
