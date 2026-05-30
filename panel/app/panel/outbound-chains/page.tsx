"use client";

import { GitBranch, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Input, Modal, SelectNative, Spinner, Switch, useToast } from "@/components/ui";

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

/** Visual left-to-right flow: client → entry inbound → balancer(strategy) → members → internet. */
function CascadeFlow({
  name,
  strategy,
  members,
  t,
}: {
  name: string;
  strategy: string;
  members: string[];
  t: ReturnType<typeof useTranslation>["t"];
}) {
  const box = "rounded-md border px-2 py-1 text-[11px] whitespace-nowrap";
  const arrow = <span className="text-[var(--fg-subtle)]">→</span>;
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--fg-subtle)]">
        {t("pages.outboundChains.flowTitle", { defaultValue: "Traffic flow" })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${box} border-[var(--border)] text-[var(--fg-muted)]`}>
          {t("pages.outboundChains.flowClient", { defaultValue: "client" })}
        </span>
        {arrow}
        <span className={`${box} border-[var(--border)] text-[var(--fg-muted)]`}>
          {t("pages.outboundChains.flowInbound", { defaultValue: "inbound + routing rule" })}
        </span>
        {arrow}
        <span className={`${box} border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] font-mono text-[var(--accent)]`}>
          {(name.trim() || "balancer")} · {strategy}
        </span>
        {arrow}
        <span className="inline-flex flex-wrap items-center gap-1">
          {members.length === 0 ? (
            <span className={`${box} border-amber-500/40 bg-amber-500/10 text-amber-300`}>
              {t("pages.outboundChains.flowNoMembers", { defaultValue: "pick members ↓" })}
            </span>
          ) : (
            members.map((m) => (
              <span key={m} className={`${box} border-[var(--border)] font-mono text-[var(--fg)]`}>
                {m}
              </span>
            ))
          )}
        </span>
        {arrow}
        <span className={`${box} border-emerald-500/40 bg-emerald-500/10 text-emerald-300`}>
          {t("pages.outboundChains.flowInternet", { defaultValue: "internet" })}
        </span>
      </div>
    </div>
  );
}

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

  const [outboundIdByTag, setOutboundIdByTag] = useState<Record<string, number>>({});
  const [memberTests, setMemberTests] = useState<Record<string, { ok: boolean; latencyMs: number; error?: string } | "busy">>({});

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Chain[]>(panel("outbound-chain/list"));
    const ob = await getJson<Array<{ id: number; tag: string }>>(panel("outbound/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) setRows(r.obj);
    if (ob.success && Array.isArray(ob.obj)) {
      setOutboundTags(ob.obj.map((x) => x.tag).filter(Boolean));
      const map: Record<string, number> = {};
      for (const x of ob.obj) {
        if (x.tag) map[x.tag] = x.id;
      }
      setOutboundIdByTag(map);
    }
  }, []);

  const testMembers = async () => {
    for (const tag of members) {
      const id = outboundIdByTag[tag];
      if (!id) {
        setMemberTests((m) => ({ ...m, [tag]: { ok: false, latencyMs: 0, error: "no outbound id" } }));
        continue;
      }
      setMemberTests((m) => ({ ...m, [tag]: "busy" }));
      type R = { ok: boolean; latencyMs: number; error?: string };
      const r = await postJson<R>(panel(`outbound/test/${id}`), {}, true);
      setMemberTests((m) => ({
        ...m,
        [tag]: r.success && r.obj
          ? { ok: r.obj.ok, latencyMs: r.obj.latencyMs, error: r.obj.error }
          : { ok: false, latencyMs: 0, error: r.msg || "fail" },
      }));
    }
  };

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
      toast.error(t("pages.outboundChains.nameRequired", { defaultValue: "Name required" }));
      return;
    }
    if (members.length === 0) {
      toast.error(t("pages.outboundChains.membersRequired", { defaultValue: "Pick at least one member outbound" }));
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
      toast.success(editId
        ? t("pages.outboundChains.updatedToast", { defaultValue: "Updated" })
        : t("pages.outboundChains.createdToast", { defaultValue: "Created" }));
      setOpen(false);
      void load();
    } else {
      toast.error(r.msg || t("pages.outboundChains.failedToast", { defaultValue: "Failed" }));
    }
  };

  const del = async (id: number) => {
    const msg = t("pages.outboundChains.deleteConfirm", { id, defaultValue: `Delete chain #${id}?` });
    if (!confirm(msg)) return;
    const r = await postJson(panel(`outbound-chain/del/${id}`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || t("pages.outboundChains.failedToast", { defaultValue: "Failed" }));
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
          {t("pages.outboundChains.subtitle", { defaultValue: 'Xray routing.balancers entries. Strategy "leastPing" picks the lowest-latency member via observatory probes. Members are any Xray outbound tag (cascade bridge, WARP, native VLESS/Trojan).' })}
        </p>
        <Button onClick={openCreate}>{t("pages.outboundChains.addButton", { defaultValue: "+ Add chain" })}</Button>
      </Surface>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center"><Spinner size={32} /></div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={GitBranch} tone="info" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("pages.outboundChains.emptyState", { defaultValue: "No chains." })}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-3">{t("pages.outboundChains.colName", { defaultValue: "Name" })}</th>
                <th className="p-3">{t("pages.outboundChains.colStrategy", { defaultValue: "Strategy" })}</th>
                <th className="p-3">{t("pages.outboundChains.colMembers", { defaultValue: "Members" })}</th>
                <th className="p-3">{t("pages.outboundChains.colInterval", { defaultValue: "Interval (s)" })}</th>
                <th className="p-3">{t("pages.outboundChains.colEnable", { defaultValue: "Enable" })}</th>
                <th className="p-3">{t("pages.outboundChains.colActions", { defaultValue: "Actions" })}</th>
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
                      <Button variant="secondary" onClick={() => openEdit(r)}>{t("edit", { defaultValue: "Edit" })}</Button>
                      <Button variant="danger" onClick={() => del(r.id)}><Trash2 className="size-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Modal open={open} onClose={() => setOpen(false)} title={editId ? t("pages.outboundChains.editTitle", { id: editId, defaultValue: `Edit chain #${editId}` }) : t("pages.outboundChains.addTitle", { defaultValue: "Add chain" })}>
        <div className="space-y-3">
          {/* Guide: what a cascade is + how it routes */}
          <div className="rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] p-3 text-xs leading-relaxed text-[var(--fg-muted)]">
            <p className="mb-1 font-medium text-[var(--fg)]">
              {t("pages.outboundChains.guideTitle", { defaultValue: "How a cascade works" })}
            </p>
            <p>
              {t("pages.outboundChains.guideBody", {
                defaultValue:
                  "A cascade is an Xray load-balancer (routing.balancers). Client traffic enters an inbound, then a routing rule sends it to this balancer by its tag. The balancer forwards to one of the member outbounds — each member is itself a hop (a sidecar bridge, a WARP account, or a native VLESS/Trojan out). The strategy decides which member: leastPing picks the lowest-latency one via observatory probes, random spreads load, priority always prefers the first reachable.",
              })}
            </p>
          </div>

          {/* Live flow diagram */}
          <CascadeFlow name={name} strategy={strategy} members={members} t={t} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundChains.fieldName", { defaultValue: "Name (becomes balancerTag)" })}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="cascade-eu" />
              <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">{t("pages.outboundChains.fieldNameHint", { defaultValue: "Reference this tag from a routing rule's target = Balancer." })}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundChains.fieldStrategy", { defaultValue: "Strategy" })}</label>
              <SelectNative value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </SelectNative>
              <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">
                {strategy === "leastPing"
                  ? t("pages.outboundChains.strategyHintLeastPing", { defaultValue: "Lowest-latency member (needs probes below)." })
                  : strategy === "random"
                    ? t("pages.outboundChains.strategyHintRandom", { defaultValue: "Random member each connection — spreads load." })
                    : t("pages.outboundChains.strategyHintPriority", { defaultValue: "Always the first reachable member; others are fallback." })}
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundChains.fieldProbeUrl", { defaultValue: "Probe URL" })}</label>
              <Input className="font-mono text-xs" value={probeUrl} onChange={(e) => setProbeUrl(e.target.value)} placeholder="https://www.gstatic.com/generate_204" />
              <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">{t("pages.outboundChains.fieldProbeUrlHint", { defaultValue: "Observatory fetches this through each member to measure latency. A 204 endpoint is ideal." })}</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.outboundChains.fieldProbeInterval", { defaultValue: "Probe interval (seconds)" })}</label>
              <Input type="number" value={probeIntervalSeconds} onChange={(e) => setProbeIntervalSeconds(parseInt(e.target.value, 10) || 60)} />
              <p className="mt-0.5 text-[11px] text-[var(--fg-subtle)]">{t("pages.outboundChains.fieldProbeIntervalHint", { defaultValue: "How often to re-measure. 60–300s is typical." })}</p>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={enable} onChange={setEnable} />
              <span className="text-xs">{t("pages.outboundChains.fieldEnabled", { defaultValue: "Enabled" })}</span>
            </div>
          </div>
          <div className="rounded-lg border border-[var(--border)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs text-[var(--fg-muted)]">{t("pages.outboundChains.fieldMembers", { defaultValue: "Members (Xray outbound tags)" })}</label>
              <Button variant="secondary" onClick={() => void testMembers()} disabled={members.length === 0}>
                <Zap className="mr-1 size-3 inline" />
                {t("pages.outboundChains.testMembersButton", { defaultValue: "Test members" })}
              </Button>
            </div>
            {outboundTags.length === 0 ? (
              <p className="text-xs text-[var(--fg-subtle)]">{t("pages.outboundChains.membersEmpty", { defaultValue: "No outbound tags found. Create an OutboundSidecar or WARP account first." })}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {outboundTags.map((tag) => {
                  const on = members.includes(tag);
                  const tr = memberTests[tag];
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-mono ${on ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--border)] text-[var(--fg-muted)]"}`}
                      onClick={() => setMembers((cur) => on ? cur.filter((x) => x !== tag) : [...cur, tag])}
                    >
                      {tag}
                      {on && tr ? (
                        <span className="ml-1 opacity-80">
                          {tr === "busy" ? "…" : tr.ok ? `${tr.latencyMs}ms` : "✗"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>{t("cancel", { defaultValue: "Cancel" })}</Button>
            <Button onClick={save} disabled={busy}>{busy ? t("saving", { defaultValue: "Saving…" }) : t("save", { defaultValue: "Save" })}</Button>
          </div>
        </div>
      </Modal>
    </PageScaffold>
  );
}
