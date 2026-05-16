"use client";

import { GitBranch, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Input, Modal, SelectNative, Spinner, Switch, useToast } from "@/components/ui";

// Phase 4 — OutboundChain full CRUD.

type Member = { outboundTag: string; sortOrder: number };
type Chain = {
  id: number;
  name: string;
  strategy: string;
  probeUrl: string;
  probeIntervalSeconds: number;
  enable: boolean;
  members?: Member[];
};

const STRATEGIES = ["leastPing", "random", "priority"];

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Chain[]>([]);
  const [outboundTags, setOutboundTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState("leastPing");
  const [probeUrl, setProbeUrl] = useState("https://www.google.com/generate_204");
  const [probeIntervalSeconds, setProbeIntervalSeconds] = useState(300);
  const [enable, setEnable] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Chain[]>(panel("outbound-chain/list"));
    const ob = await getJson<Array<{ tag: string }>>(panel("outbound/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) setRows(r.obj);
    if (ob.success && Array.isArray(ob.obj)) setOutboundTags(ob.obj.map((x) => x.tag).filter(Boolean));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => {
    setEditId(null);
    setName(`chain-${Math.random().toString(36).slice(2, 6)}`);
    setStrategy("leastPing");
    setProbeUrl("https://www.google.com/generate_204");
    setProbeIntervalSeconds(300);
    setEnable(true);
    setMembers([]);
    setOpen(true);
  };

  const openEdit = (c: Chain) => {
    setEditId(c.id);
    setName(c.name);
    setStrategy(c.strategy);
    setProbeUrl(c.probeUrl);
    setProbeIntervalSeconds(c.probeIntervalSeconds);
    setEnable(c.enable);
    setMembers((c.members || []).map((m) => m.outboundTag));
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    if (members.length === 0) {
      toast.error("Pick at least one member outbound");
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      strategy,
      probeUrl,
      probeIntervalSeconds,
      enable,
      members: members.map((tag, i) => ({ outboundTag: tag, sortOrder: i })),
    };
    const path = editId ? `outbound-chain/update/${editId}` : "outbound-chain/add";
    const r = await postJson(panel(path), body, true);
    setBusy(false);
    if (r.success) {
      toast.success(editId ? "Updated" : "Created");
      setOpen(false);
      void load();
    } else {
      toast.error(r.msg || "Failed");
    }
  };

  const del = async (id: number) => {
    if (!confirm(`Delete chain #${id}?`)) return;
    const r = await postJson(panel(`outbound-chain/del/${id}`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || "Failed");
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.outboundChains", { defaultValue: "Outbound Chains" })}
        icon={GitBranch}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          Xray <code className="font-mono">routing.balancers</code> entries.
          Strategy &quot;leastPing&quot; picks the lowest-latency member via observatory probes.
          Members are any Xray outbound tag (cascade bridge, WARP, native VLESS/Trojan).
        </p>
        <Button onClick={openCreate}>+ Add chain</Button>
      </Surface>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center"><Spinner size={32} /></div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={GitBranch} tone="info" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">No chains.</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-3">Name</th>
                <th className="p-3">Strategy</th>
                <th className="p-3">Members</th>
                <th className="p-3">Interval (s)</th>
                <th className="p-3">Enable</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]">
                  <td className="p-3 font-mono text-xs">{r.name}</td>
                  <td className="p-3 text-xs">{r.strategy}</td>
                  <td className="p-3 text-xs">{(r.members || []).map((m) => m.outboundTag).join(", ") || "—"}</td>
                  <td className="p-3 text-xs">{r.probeIntervalSeconds}</td>
                  <td className="p-3 text-xs">{r.enable ? "yes" : "no"}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="secondary" onClick={() => openEdit(r)}>Edit</Button>
                      <Button variant="danger" onClick={() => del(r.id)}><Trash2 className="size-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? `Edit chain #${editId}` : "Add chain"}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">Name (becomes balancerTag)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">Strategy</label>
              <SelectNative value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </SelectNative>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">Probe URL</label>
              <Input className="font-mono text-xs" value={probeUrl} onChange={(e) => setProbeUrl(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">Probe interval (seconds)</label>
              <Input type="number" value={probeIntervalSeconds} onChange={(e) => setProbeIntervalSeconds(parseInt(e.target.value, 10) || 60)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={enable} onChange={setEnable} />
              <span className="text-xs">Enabled</span>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <label className="mb-2 block text-xs text-[var(--fg-muted)]">Members (Xray outbound tags)</label>
            {outboundTags.length === 0 ? (
              <p className="text-xs text-[var(--fg-subtle)]">No outbound tags found. Create an OutboundSidecar or WARP account first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {outboundTags.map((tag) => {
                  const on = members.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-mono ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}
                      onClick={() => setMembers((cur) => on ? cur.filter((x) => x !== tag) : [...cur, tag])}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </Modal>
    </PageScaffold>
  );
}
