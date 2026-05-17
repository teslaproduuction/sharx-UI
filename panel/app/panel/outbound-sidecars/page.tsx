"use client";

import { Eye, Network, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Input, Modal, SelectNative, Spinner, Switch, useToast } from "@/components/ui";

type Sidecar = {
  id: number;
  name: string;
  kind: string;
  config: string;
  listenPort: number;
  enable: boolean;
  nodeIds?: number[];
};

type Node = {
  id: number;
  name: string;
};

type PreviewFragments = {
  outbound: unknown;
  bridgeInbound: unknown;
  routeRule: unknown;
};

const KIND_OPTIONS = ["anytls_client", "mieru_client", "tuic_client", "hy2_client", "wireguard_client"];

const KIND_FIELDS: Record<string, string[]> = {
  anytls_client:    ["server", "server_port", "password", "tls.server_name", "tls.insecure"],
  mieru_client:     ["server", "server_port", "username", "password"],
  tuic_client:      ["server", "server_port", "uuid", "password", "tls.server_name", "congestion_control"],
  hy2_client:       ["server", "server_port", "password", "tls.server_name"],
  // wireguard_client: vanilla WG fields + optional Amnezia obfuscation block
  // (jc/jmin/jmax + s1-s4 + h1-h4) for tunneling through a self-hosted AWG
  // server in DPI-heavy regions. amnezia.* fields are optional; empty → plain WG.
  wireguard_client: [
    "server", "server_port", "private_key", "peer_public_key",
    "address", "reserved", "mtu",
    "amnezia.jc", "amnezia.jmin", "amnezia.jmax",
    "amnezia.s1", "amnezia.s2", "amnezia.s3", "amnezia.s4",
    "amnezia.h1", "amnezia.h2", "amnezia.h3", "amnezia.h4",
  ],
};

const blankConfig = (kind: string): Record<string, unknown> => {
  switch (kind) {
    case "anytls_client":
      return { server: "", server_port: 443, password: "", tls: { server_name: "", insecure: false } };
    case "mieru_client":
      return { server: "", server_port: 2999, username: "", password: "", network: ["tcp"] };
    case "tuic_client":
      return { server: "", server_port: 443, uuid: "", password: "", tls: { server_name: "", alpn: ["h3"] }, congestion_control: "bbr" };
    case "hy2_client":
      return { server: "", server_port: 443, password: "", tls: { server_name: "" } };
    case "wireguard_client":
      return {
        server: "",
        server_port: 51820,
        private_key: "",
        peer_public_key: "",
        address: "10.0.0.2/32",
        reserved: "",
        mtu: 1408,
        amnezia: { jc: 0, jmin: 0, jmax: 0, s1: 0, s2: 0, s3: 0, s4: 0, h1: 0, h2: 0, h3: 0, h4: 0 },
      };
    default:
      return {};
  }
};

function readPath(obj: Record<string, unknown>, path: string): string {
  const segs = path.split(".");
  let cur: unknown = obj;
  for (const s of segs) {
    if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[s];
    else return "";
  }
  if (cur === null || cur === undefined) return "";
  if (typeof cur === "boolean") return cur ? "true" : "false";
  return String(cur);
}

function writePath(obj: Record<string, unknown>, path: string, val: string): Record<string, unknown> {
  const segs = path.split(".");
  const out = { ...obj };
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const k = segs[i];
    const next = cur[k];
    if (!next || typeof next !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = segs[segs.length - 1];
  if (val === "true") cur[last] = true;
  else if (val === "false") cur[last] = false;
  else if (
    last === "server_port" || last === "port" || last === "mtu" ||
    // Amnezia obfuscation params are all unsigned integers (junk-packet
    // counts + magic-header values). Coerce so sing-box doesn't reject the
    // config with a "cannot unmarshal string into int" error.
    ["jc","jmin","jmax","s1","s2","s3","s4","h1","h2","h3","h4"].includes(last)
  ) cur[last] = parseInt(val, 10) || 0;
  else cur[last] = val;
  return out;
}

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Sidecar[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("mieru_client");
  const [config, setConfig] = useState<Record<string, unknown>>(blankConfig("mieru_client"));
  const [listenPort, setListenPort] = useState(43210);
  const [enable, setEnable] = useState(true);
  const [nodeIds, setNodeIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewFragments | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [multiNode, setMultiNode] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Sidecar[]>(panel("outbound-sidecar/list"));
    const nr = await getJson<Node[]>(panel("node/list"));
    const sr = await postJson<Record<string, unknown>>(panel("setting/all"), {}, true);
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) setRows(r.obj);
    if (nr.success && Array.isArray(nr.obj)) setNodes(nr.obj);
    if (sr.success && sr.obj) setMultiNode(Boolean(sr.obj.multiNodeMode));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setName(`to-${Math.random().toString(36).slice(2, 6)}`);
    setKind("mieru_client");
    setConfig(blankConfig("mieru_client"));
    setListenPort(43210 + Math.floor(Math.random() * 100));
    setEnable(true);
    setNodeIds([]);
    setOpen(true);
  };

  const openEdit = (sc: Sidecar) => {
    setEditId(sc.id);
    setName(sc.name);
    setKind(sc.kind);
    try {
      setConfig(JSON.parse(sc.config || "{}"));
    } catch {
      setConfig(blankConfig(sc.kind));
    }
    setListenPort(sc.listenPort);
    setEnable(sc.enable);
    setNodeIds(sc.nodeIds || []);
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(t("pages.outboundSidecars.nameRequired", { defaultValue: "Name required" }));
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      kind,
      config: JSON.stringify(config),
      listenPort,
      enable,
      nodeIds,
    };
    const path = editId ? `outbound-sidecar/update/${editId}` : "outbound-sidecar/add";
    const r = await postJson(panel(path), body, true);
    setBusy(false);
    if (r.success) {
      toast.success(editId
        ? t("pages.outboundSidecars.updatedToast", { defaultValue: "Updated" })
        : t("pages.outboundSidecars.createdToast", { defaultValue: "Created" }));
      setOpen(false);
      void load();
    } else {
      toast.error(r.msg || t("pages.outboundSidecars.failedToast", { defaultValue: "Failed" }));
    }
  };

  const doPreview = async () => {
    setPreviewBusy(true);
    setPreview(null);
    setPreviewOpen(true);
    const body = {
      name: name.trim() || "preview",
      kind,
      config: JSON.stringify(config),
      listenPort: listenPort || 43000,
      enable: true,
    };
    const r = await postJson<PreviewFragments>(panel("outbound-sidecar/preview"), body, true);
    setPreviewBusy(false);
    if (r.success && r.obj) {
      setPreview(r.obj);
    } else {
      toast.error(r.msg || t("pages.outboundSidecars.failedToast", { defaultValue: "Failed" }));
      setPreviewOpen(false);
    }
  };

  const del = async (id: number) => {
    const msg = t("pages.outboundSidecars.deleteConfirm", { id, defaultValue: `Delete sidecar #${id}? Auto-created Xray outbound row will be removed too.` });
    if (!confirm(msg)) return;
    const r = await postJson(panel(`outbound-sidecar/del/${id}`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || t("pages.outboundSidecars.failedToast", { defaultValue: "Failed" }));
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.outboundSidecars", { defaultValue: "Outbound Sidecars" })}
        icon={Network}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.outboundSidecars.subtitle", { defaultValue: "Cascade members. Each row spawns a sing-box client outbound + 127.0.0.1:listen_port bridge + auto-created Xray socks-out tagged <name>-local. Empty Nodes list = panel host (cascade hub)." })}
        </p>
        <Button onClick={openCreate}>+ {t("pages.outboundSidecars.addButton", { defaultValue: "Add sidecar" })}</Button>
      </Surface>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center"><Spinner size={32} /></div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={Network} tone="info" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("pages.outboundSidecars.emptyState", { defaultValue: "No sidecars yet." })}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-3">{t("pages.outboundSidecars.colName", { defaultValue: "Name" })}</th>
                <th className="p-3">{t("pages.outboundSidecars.colKind", { defaultValue: "Kind" })}</th>
                <th className="p-3">{t("pages.outboundSidecars.colBridge", { defaultValue: "Bridge" })}</th>
                <th className="p-3">{t("pages.outboundSidecars.colNodes", { defaultValue: "Nodes" })}</th>
                <th className="p-3">{t("pages.outboundSidecars.colEnable", { defaultValue: "Enable" })}</th>
                <th className="p-3">{t("pages.outboundSidecars.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]">
                  <td className="p-3 font-mono text-xs text-[var(--fg)]">{r.name}</td>
                  <td className="p-3 text-xs">{r.kind}</td>
                  <td className="p-3 font-mono text-xs">127.0.0.1:{r.listenPort}</td>
                  <td className="p-3 text-xs">{(r.nodeIds && r.nodeIds.length > 0) ? r.nodeIds.join(",") : "hub"}</td>
                  <td className="p-3 text-xs">{r.enable ? "yes" : "no"}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="secondary" onClick={() => openEdit(r)}>{t("edit", { defaultValue: "Edit" })}</Button>
                      <Button variant="danger" onClick={() => del(r.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? t("pages.outboundSidecars.editTitle", { id: editId, defaultValue: `Edit sidecar #${editId}` }) : t("pages.outboundSidecars.addTitle", { defaultValue: "Add sidecar" })}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundSidecars.fieldName", { defaultValue: "Name" })}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundSidecars.fieldKind", { defaultValue: "Kind" })}</label>
              <SelectNative value={kind} onChange={(e) => { const k = e.target.value; setKind(k); setConfig(blankConfig(k)); }}>
                {KIND_OPTIONS.map((k) => <option key={k} value={k}>{k}</option>)}
              </SelectNative>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundSidecars.fieldListenPort", { defaultValue: "Listen port (local bridge)" })}</label>
              <Input type="number" value={listenPort} onChange={(e) => setListenPort(parseInt(e.target.value, 10) || 0)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={enable} onChange={setEnable} />
              <span className="text-xs">{t("pages.outboundSidecars.fieldEnabled", { defaultValue: "Enabled" })}</span>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
              {t("pages.outboundSidecars.targetSection", { kind, defaultValue: `Target (${kind})` })}
            </p>
            {(KIND_FIELDS[kind] || []).map((field) => (
              <div key={field}>
                <label className="mb-1 block text-xs text-[var(--fg-muted)]">{field}</label>
                <Input
                  className="font-mono text-xs"
                  value={readPath(config, field)}
                  onChange={(e) => setConfig(writePath(config, field, e.target.value))}
                />
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundSidecars.fieldNodes", { defaultValue: "Nodes (multi-select; empty = panel-host hub)" })}</label>
            <div className="flex flex-wrap gap-2">
              {!multiNode ? (() => {
                const on = nodeIds.length === 0 || nodeIds.includes(0);
                return (
                  <button
                    key="panel-host"
                    type="button"
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}
                    onClick={() => setNodeIds((cur) => {
                      const has0 = cur.includes(0);
                      const onlyPanelImplicit = cur.length === 0;
                      if (has0 || onlyPanelImplicit) {
                        return cur.filter((x) => x !== 0);
                      }
                      return [0, ...cur];
                    })}
                    title={t("pages.outboundSidecars.panelHostHint", { defaultValue: "Run on the panel host (cascade hub). Empty selection means the same thing implicitly." })}
                  >
                    {t("pages.outboundSidecars.panelHostOption", { defaultValue: "panel-host" })}
                  </button>
                );
              })() : (
                <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                  {t("pages.outboundSidecars.multiNodePanelHostHidden", {
                    defaultValue: "Multi-node mode: panel-host runs no workload. Assign a worker.",
                  })}
                </span>
              )}
              {nodes.length === 0 ? (
                <span className="text-xs text-[var(--fg-subtle)]">{t("pages.outboundSidecars.nodesEmpty", { defaultValue: "No worker nodes registered — sidecar runs on panel host." })}</span>
              ) : nodes.map((n) => {
                const on = nodeIds.includes(n.id);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}
                    onClick={() => setNodeIds((cur) => on ? cur.filter((x) => x !== n.id) : [...cur, n.id])}
                  >
                    {n.name}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => void doPreview()}>
              <Eye className="mr-1 size-4 inline" />
              {t("pages.outboundSidecars.previewButton", { defaultValue: "Preview config" })}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("cancel", { defaultValue: "Cancel" })}</Button>
            <Button onClick={save} disabled={busy}>{busy ? t("saving", { defaultValue: "Saving…" }) : t("save", { defaultValue: "Save" })}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title={t("pages.outboundSidecars.previewTitle", { defaultValue: "Sing-box client outbound config" })}>
        {previewBusy ? (
          <div className="grid min-h-32 place-items-center"><Spinner size={28} /></div>
        ) : preview ? (
          <pre className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
            {JSON.stringify(preview, null, 2)}
          </pre>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Button variant="secondary" onClick={() => setPreviewOpen(false)}>{t("close", { defaultValue: "Close" })}</Button>
        </div>
      </Modal>
    </PageScaffold>
  );
}
