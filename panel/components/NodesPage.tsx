"use client";

import { Copy, Network, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import { joinNameFlag, NAME_FLAG_SELECT_OPTIONS } from "@/lib/nameFlag";
import { NodeRegisterStep } from "@/components/NodeRegisterStep";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  Button,
  CheckboxField,
  IconTile,
  Input,
  Modal,
  Reveal,
  SelectNative,
  Spinner,
  useToast,
} from "@/components/ui";

type InboundRef = { id?: number; remark?: string };
type ProfileRef = { id?: number; name?: string };

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
};

const NODE_DOCKER_IMAGE = "registry.konstpic.ru/sharx/sharxnode:latest";

type PendingRegistration = {
  nodeId: number;
  secretKey?: string;
  apiKey?: string;
};

function stripTrailingUrlSlashes(s: string) {
  return s.replace(/\/+$/, "");
}

/** Accepts host:port or https://…; server expects a full base URL. */
function normalizeNodeAddress(
  raw: string,
  opts: { legacyAuth: boolean; useTls: boolean },
) {
  const t = raw.trim();
  if (!t) return "";
  const low = t.toLowerCase();
  if (low.startsWith("http://") || low.startsWith("https://")) {
    return stripTrailingUrlSlashes(t);
  }
  const scheme = opts.legacyAuth && !opts.useTls ? "http" : "https";
  return stripTrailingUrlSlashes(`${scheme}://${t}`);
}

/**
 * In host network mode, public URL in docs usually omits the published port
 * (service listens on host :8080; reverse proxy or DNS points here without :port in URL).
 */
function addressForHostComposeHint(
  addressInput: string,
  opts: { legacyAuth: boolean; useTls: boolean },
): string {
  const normalized = normalizeNodeAddress(addressInput.trim(), opts);
  if (!normalized) return "";
  try {
    const u = new URL(
      normalized.startsWith("http") ? normalized : `https://${normalized}`,
    );
    u.port = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return normalized;
  }
}

/** Host-network worker: API on port 8080 in the process (default); no port publishing. */
function buildNodeDockerComposeYaml(secretKey: string, panelUrl: string) {
  const p = panelUrl || "https://your-panel.example";
  return `services:
  node:
    image: ${NODE_DOCKER_IMAGE}
    container_name: sharx-node
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./bin:/app/bin
      - ./logs:/app/logs
      - ./cert:/app/cert
      - ./data:/app/data
    environment:
      PANEL_URL: ${JSON.stringify(p)}
      SECRET_KEY: ${JSON.stringify(secretKey)}
`;
}

export function NodesPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<NodeRow[]>([]);
  const [loading, setLoading] = useState(true);

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
  const [createdApiKey, setCreatedApiKey] = useState<string | null>(null);
  const [createdSecretKey, setCreatedSecretKey] = useState<string | null>(null);
  // Panel-wide pairing secret: same for every node, fetched once on modal open.
  const [panelSecretKey, setPanelSecretKey] = useState<string | null>(null);
  const [panelSecretLoading, setPanelSecretLoading] = useState(false);
  const [panelOrigin, setPanelOrigin] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<NodeRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [draftDeleteBusy, setDraftDeleteBusy] = useState(false);
  const [form, setForm] = useState({
    nameFlag: "",
    name: "",
    address: "",
    useTls: false,
    certPath: "",
    keyPath: "",
    insecureTls: false,
    trafficLimitGB: "0",
    legacyAuth: false,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    nameFlag: "",
    address: "",
    trafficLimitGB: "0",
    useTls: false,
    certPath: "",
    keyPath: "",
    insecureTls: false,
    legacyAuth: false,
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

  useEffect(() => {
    void load();
  }, [load]);

  const resetAddModal = () => {
    setAddWizardStep(1);
    setIsRegistering(false);
    setRegisterPhase("create");
    setRegisterError(null);
    setRegisterFailKind(null);
    setPendingReg(null);
    setForm({
      nameFlag: "",
      name: "",
      address: "",
      useTls: false,
      certPath: "",
      keyPath: "",
      insecureTls: false,
      trafficLimitGB: "0",
      legacyAuth: false,
    });
    setCreatedApiKey(null);
    setCreatedSecretKey(null);
  };

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
  };

  const closeAdd = () => {
    if (isRegistering) return;
    setAddOpen(false);
    resetAddModal();
  };

  const statusLabel = (s: string) => {
    const k = s?.toLowerCase();
    if (k === "online") return t("pages.nodes.online");
    if (k === "offline") return t("pages.nodes.offline");
    if (k === "unknown") return t("pages.nodes.unknown");
    return s || t("pages.nodes.unknown");
  };

  const getAddBody = useCallback(():
    | { name: string; address: string; body: Record<string, unknown> }
    | null => {
    const name = joinNameFlag(form.nameFlag, form.name.trim());
    const address = normalizeNodeAddress(form.address.trim(), {
      legacyAuth: form.legacyAuth,
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
      legacyAuth: form.legacyAuth,
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
            apiKey: obj.apiKey || undefined,
          };
          setPendingReg(stash);
        } else {
          if (!pendingReg) return;
          stash = { ...pendingReg };
        }

        if (!stash) return;

        {
          const sk0 = stash.secretKey?.trim() ?? "";
          const ak0 = stash.apiKey?.trim() ?? "";
          if (sk0) {
            setCreatedSecretKey(sk0);
          } else if (ak0) {
            setCreatedApiKey(ak0);
          }
        }
        if (typeof window !== "undefined") {
          setPanelOrigin((prev) => prev || window.location.origin);
        }

        setRegisterPhase("verify");
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

        const sk = stash.secretKey?.trim() ?? "";
        const ak = stash.apiKey?.trim() ?? "";
        if (!sk && !ak) {
          setAddWizardStep(3);
          setPendingReg(null);
          void load();
          return;
        }
        setPendingReg(null);
        setAddWizardStep(3);
        void load();
        toast.success(t("pages.nodes.addSuccess"));
      } catch {
        setRegisterError(t("pages.nodes.addError"));
        setRegisterFailKind(checkOnly ? "check" : "add");
      } finally {
        setIsRegistering(false);
      }
    },
    [getAddBody, pendingReg, t, toast, load],
  );

  runRegisterRef.current = runRegisterFlow;

  const goToRegister = useCallback(() => {
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
    setForm((f) => ({ ...f, address: pack.address }));
    setAddWizardStep(2);
    setRegisterError(null);
    setRegisterFailKind(null);
    const checkOnly = Boolean(pendingReg);
    setTimeout(() => {
      void runRegisterRef.current(checkOnly);
    }, 0);
  }, [getAddBody, form.name, form.nameFlag, pendingReg, t, toast]);

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
    setCreatedApiKey(null);
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
        setCreatedApiKey(null);
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

  const copyApiKey = async () => {
    if (!createdApiKey) return;
    try {
      await copyTextToClipboard(createdApiKey);
      toast.success(t("copied"));
    } catch {
      toast.error(t("pages.nodes.copyError"));
    }
  };

  const publicUrlHint = useMemo(
    () =>
      addressForHostComposeHint(form.address, {
        legacyAuth: form.legacyAuth,
        useTls: form.useTls,
      }),
    [form.address, form.legacyAuth, form.useTls],
  );

  const addModalTitle = useMemo(() => {
    if (addWizardStep === 3) {
      if (createdSecretKey) return t("pages.nodes.secretKeyGenerated");
      if (createdApiKey) return t("pages.nodes.apiKeyGenerated");
      return t("pages.nodes.addSuccess");
    }
    if (addWizardStep === 2) return t("pages.nodes.wizardRegisterTitle");
    return t("pages.nodes.wizardFormTitle");
  }, [addWizardStep, createdApiKey, createdSecretKey, t]);

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

  const finishCreated = () => {
    setAddOpen(false);
    resetAddModal();
    void load();
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

  const openEdit = async (row: NodeRow) => {
    setEditId(row.id);
    setEditForm({
      name: row.name,
      nameFlag: "",
      address: row.address,
      trafficLimitGB: String(
        row.trafficLimitGB != null && row.trafficLimitGB > 0
          ? row.trafficLimitGB
          : 0,
      ),
      useTls: Boolean(row.useTls),
      certPath: row.certPath ?? "",
      keyPath: row.keyPath ?? "",
      insecureTls: Boolean(row.insecureTls),
      legacyAuth: (row.authMode ?? "").toLowerCase() === "legacy",
    });
    const r = await getJson<NodeRow>(panel(`node/get/${row.id}`));
    if (r.success && r.obj && typeof r.obj === "object") {
      const o = r.obj as NodeRow;
      setEditForm((f) => ({
        ...f,
        name: o.name,
        address: o.address,
        trafficLimitGB: String(
          o.trafficLimitGB != null && o.trafficLimitGB > 0
            ? o.trafficLimitGB
            : 0,
        ),
        useTls: Boolean(o.useTls),
        certPath: o.certPath ?? "",
        keyPath: o.keyPath ?? "",
        insecureTls: Boolean(o.insecureTls),
        legacyAuth: (o.authMode ?? "").toLowerCase() === "legacy",
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
    const address = normalizeNodeAddress(editForm.address.trim(), {
      legacyAuth: editForm.legacyAuth,
      useTls: editForm.useTls,
    });
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
        useTls: editForm.legacyAuth ? editForm.useTls : true,
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
    if (k === "pairing" || k === "remna")
      return t("pages.nodes.authPairing");
    return t("pages.nodes.authLegacy");
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.nodes.title")}
        icon={Network}
        iconTone="success"
        actions={
          <>
            <Button
              variant="primary"
              onClick={() => void load()}
              loading={loading}
              className="!gap-2"
            >
              <RefreshCw size={16} />
              {t("refresh")}
            </Button>
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
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th className="p-3">{t("pages.nodes.name")}</th>
                  <th className="p-3">{t("pages.nodes.address")}</th>
                  <th className="p-3">{t("pages.nodes.authMode")}</th>
                  <th className="p-3">{t("pages.nodes.status")}</th>
                  <th className="p-3">{t("pages.nodes.responseTime")}</th>
                  <th className="p-3">{t("pages.nodes.xrayVersion")}</th>
                  <th className="p-3">{t("pages.nodes.assignedInbounds")}</th>
                  <th className="p-3 w-28">{t("pages.nodes.operate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                  >
                    <td className="p-3 text-[var(--fg)]">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.address}</td>
                    <td className="p-3 text-xs">{authModeLabel(r.authMode)}</td>
                    <td className="p-3">{statusLabel(r.status)}</td>
                    <td className="p-3 font-mono text-xs">
                      {r.responseTime != null && r.responseTime > 0
                        ? `${r.responseTime} ms`
                        : "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {r.xrayVersion || "—"}
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
                    <td className="p-3">
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!p-1.5"
                          onClick={() => void openEdit(r)}
                          title={t("pages.nodes.editNode")}
                          aria-label={t("pages.nodes.editNode")}
                        >
                          <Pencil size={16} />
                        </Button>
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
        )}
      </Surface>
      </Reveal>

      <Modal
        open={addOpen}
        onClose={() => {
          if (isRegistering) return;
          closeAdd();
        }}
        closable={!isRegistering}
        title={addModalTitle}
        width={
          (addWizardStep === 2 && createdSecretKey) ||
          (addWizardStep === 3 && createdSecretKey)
            ? 640
            : 580
        }
        footer={(() => {
          if (addWizardStep === 3) {
            if (createdSecretKey || createdApiKey) {
              return (
                <div className="flex flex-wrap justify-end gap-2">
                  {createdSecretKey ? (
                    <Button
                      variant="primary"
                      type="button"
                      onClick={() => void copyDockerCompose()}
                      className="!gap-2"
                    >
                      <Copy size={16} />
                      {t("pages.nodes.copyDockerCompose")}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      type="button"
                      onClick={() => void copyApiKey()}
                      className="!gap-2"
                    >
                      <Copy size={16} />
                      {t("copy")}
                    </Button>
                  )}
                  <Button variant="secondary" type="button" onClick={finishCreated}>
                    {t("close")}
                  </Button>
                </div>
              );
            }
            return (
              <div className="flex flex-wrap justify-end">
                <Button type="button" onClick={finishCreated}>
                  {t("close")}
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
                  {createdApiKey ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!gap-2"
                      onClick={() => void copyApiKey()}
                    >
                      <Copy size={16} />
                      {t("copy")}
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
                  {createdApiKey ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!gap-2"
                      onClick={() => void copyApiKey()}
                    >
                      <Copy size={16} />
                      {t("copy")}
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
        {addWizardStep === 3 && createdSecretKey ? (
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-[var(--fg-muted)]">
              {t("pages.nodes.copyComposeOnlyHint")}
            </p>
          </div>
        ) : addWizardStep === 3 && createdApiKey ? (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-[var(--fg-muted)]">
              {t("pages.nodes.saveApiKeyHint")}
            </p>
            <Input
              readOnly
              value={createdApiKey}
              className="font-mono text-xs"
            />
          </div>
        ) : addWizardStep === 3 ? null : addWizardStep === 2 ? (
          <div className="flex flex-col gap-4 text-sm">
            {createdSecretKey || createdApiKey ? (
              <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_6%,transparent)] p-3">
                <p className="text-xs text-[var(--fg-muted)]">
                  {t("pages.nodes.registerStepDeployHint")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
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
                  {createdApiKey ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!gap-2"
                      onClick={() => void copyApiKey()}
                    >
                      <Copy size={16} />
                      {t("pages.nodes.copyNodeApiKey")}
                    </Button>
                  ) : null}
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
            {!form.legacyAuth ? (
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
            ) : null}
            {!form.legacyAuth && publicUrlHint ? (
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
                  {t("pages.nodes.nameFlag")}
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
            <label className="grid gap-1">
              <span className="text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.nodeAddress")}
              </span>
              <Input
                value={form.address}
                onChange={(e) => {
                  clearDraftFromFormEdit();
                  setForm((f) => ({ ...f, address: e.target.value }));
                }}
                placeholder="node.example.com:8080"
              />
            </label>
            <CheckboxField
              label={t("pages.nodes.legacyAuth")}
              checked={form.legacyAuth}
              onChange={(e) => {
                clearDraftFromFormEdit();
                setForm((f) => ({ ...f, legacyAuth: e.target.checked }));
              }}
            />
            {!form.legacyAuth ? (
              <p className="text-[11px] text-[var(--fg-subtle)]">
                {t("pages.nodes.authPairingDescription")}
              </p>
            ) : null}
            <label className="grid gap-1">
              <span className="text-xs text-[var(--fg-muted)]">
                {t("pages.nodes.trafficLimitGB")}
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
            {form.legacyAuth ? (
              <div className="border-t border-[var(--border)] pt-3">
                <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
                  {t("pages.nodes.tlsSettings")}
                </p>
                <div className="flex flex-col gap-2">
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
                  <label className="grid gap-1">
                    <span className="text-[11px] text-[var(--fg-subtle)]">
                      {t("pages.nodes.certPath")}
                    </span>
                    <Input
                      value={form.certPath}
                      onChange={(e) => {
                        clearDraftFromFormEdit();
                        setForm((f) => ({
                          ...f,
                          certPath: e.target.value,
                        }));
                      }}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px] text-[var(--fg-subtle)]">
                      {t("pages.nodes.keyPath")}
                    </span>
                    <Input
                      value={form.keyPath}
                      onChange={(e) => {
                        clearDraftFromFormEdit();
                        setForm((f) => ({ ...f, keyPath: e.target.value }));
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={t("pages.nodes.editNode")}
        width={560}
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full shrink-0 sm:max-w-[7.5rem]">
              <label
                className="mb-1.5 block text-xs text-[var(--fg-muted)]"
                htmlFor="edit-node-name-flag"
              >
                {t("pages.nodes.nameFlag")}
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
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.nodes.nodeAddress")}
            </span>
            <Input
              value={editForm.address}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.nodes.trafficLimitGB")}
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
          {editForm.legacyAuth ? (
            <div className="border-t border-[var(--border)] pt-3">
              <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
                {t("pages.nodes.tlsSettings")}
              </p>
              <div className="flex flex-col gap-2">
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
                <label className="grid gap-1">
                  <span className="text-[11px] text-[var(--fg-subtle)]">
                    {t("pages.nodes.certPath")}
                  </span>
                  <Input
                    value={editForm.certPath}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, certPath: e.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[11px] text-[var(--fg-subtle)]">
                    {t("pages.nodes.keyPath")}
                  </span>
                  <Input
                    value={editForm.keyPath}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, keyPath: e.target.value }))
                    }
                  />
                </label>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.nodes.editPairingNote")}
            </p>
          )}
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
