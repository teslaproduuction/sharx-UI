"use client";

import { ArrowLeftRight, Globe, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Modal, Spinner, useToast } from "@/components/ui";

type Outbound = {
  id: number;
  remark?: string;
  enable: boolean;
  protocol: string;
  settings: string;
  streamSettings?: string;
  tag: string;
};

type ParseResult = {
  uri: string;
  ok: boolean;
  error?: string;
  outbound?: Outbound;
};

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<Outbound[]>([]);
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParseResult[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Outbound[]>(panel("outbound/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) setRows(r.obj);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const parse = async () => {
    setParsing(true);
    setParsed([]);
    const r = await postJson<ParseResult[]>(panel("outbound/parseUri"), { uris: importText }, true);
    setParsing(false);
    if (r.success && Array.isArray(r.obj)) setParsed(r.obj);
    else toast.error(r.msg || t("fail"));
  };

  const saveAll = async () => {
    const ok = parsed.filter((p) => p.ok && p.outbound);
    if (ok.length === 0) {
      toast.error(t("pages.outbounds.nothingToSave", { defaultValue: "Nothing valid to save" }));
      return;
    }
    setSaving(true);
    let added = 0;
    let failed = 0;
    for (const p of ok) {
      const r = await postJson(panel("outbound/add"), p.outbound, true);
      if (r.success) added += 1;
      else failed += 1;
    }
    setSaving(false);
    toast.success(t("pages.outbounds.imported", { added, failed, defaultValue: `Imported ${added}, failed ${failed}` }));
    setImportOpen(false);
    setImportText("");
    setParsed([]);
    void load();
  };

  const del = async (id: number) => {
    if (!confirm(t("pages.outbounds.deleteConfirm", { id, defaultValue: `Delete outbound #${id}?` }))) return;
    const r = await postJson(panel(`outbound/del/${id}`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || t("fail"));
  };

  const [tests, setTests] = useState<Record<number, { ok: boolean; latencyMs: number; error?: string } | "busy">>({});

  const testOne = async (id: number) => {
    setTests((m) => ({ ...m, [id]: "busy" }));
    type R = { ok: boolean; latencyMs: number; error?: string; source: string };
    const r = await postJson<R>(panel(`outbound/test/${id}`), {}, true);
    if (r.success && r.obj) {
      setTests((m) => ({ ...m, [id]: { ok: r.obj!.ok, latencyMs: r.obj!.latencyMs, error: r.obj!.error } }));
    } else {
      setTests((m) => ({ ...m, [id]: { ok: false, latencyMs: 0, error: r.msg || "test failed" } }));
    }
  };

  const testAll = async () => {
    for (const r of rows) await testOne(r.id);
  };

  // Live 204 probe — fetches generate_204 THROUGH the outbound (SOCKS/HTTP +
  // sidecar bridges); falls back to TCP for protocols we can't proxy from Go.
  const [live, setLive] = useState<
    Record<number, { ok: boolean; latencyMs: number; status?: number; mode: string; error?: string } | "busy">
  >({});
  const liveOne = async (id: number) => {
    setLive((m) => ({ ...m, [id]: "busy" }));
    type R = { ok: boolean; latencyMs: number; status?: number; mode: string; error?: string };
    const r = await postJson<R>(panel(`outbound/testLive/${id}`), {}, true);
    if (r.success && r.obj) {
      setLive((m) => ({ ...m, [id]: r.obj! }));
    } else {
      setLive((m) => ({ ...m, [id]: { ok: false, latencyMs: 0, mode: "204", error: r.msg || "test failed" } }));
    }
  };
  const liveAll = async () => {
    for (const r of rows) await liveOne(r.id);
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.outbounds")}
        icon={ArrowLeftRight}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.outbounds.subtitle", { defaultValue: "Xray outbound entries (cascade members, WARP egress, raw imports). Use Import to paste vless/vmess/trojan/ss/socks/http share links." })}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => { setImportOpen(true); setImportText(""); setParsed([]); }}>
            {t("pages.outbounds.importButton", { defaultValue: "Import from URI" })}
          </Button>
          <Button variant="secondary" onClick={() => void testAll()} disabled={rows.length === 0}>
            <Zap className="mr-1 size-4 inline" />
            {t("pages.outbounds.testAllButton", { defaultValue: "Test all (TCP)" })}
          </Button>
          <Button variant="secondary" onClick={() => void liveAll()} disabled={rows.length === 0}>
            <Globe className="mr-1 size-4 inline" />
            {t("pages.outbounds.liveTestAllButton", { defaultValue: "Live 204 all" })}
          </Button>
        </div>
      </Surface>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center"><Spinner size={32} /></div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={ArrowLeftRight} tone="info" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("pages.outbounds.empty", { defaultValue: "No outbounds." })}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-3">{t("pages.outbounds.colRemark", { defaultValue: "Remark" })}</th>
                <th className="p-3">{t("pages.outbounds.colTag", { defaultValue: "Tag" })}</th>
                <th className="p-3">{t("pages.outbounds.colProtocol", { defaultValue: "Protocol" })}</th>
                <th className="p-3">{t("pages.outbounds.colHealth", { defaultValue: "Health (TCP)" })}</th>
                <th className="p-3">{t("pages.outbounds.colLive", { defaultValue: "Live (204)" })}</th>
                <th className="p-3">{t("pages.outbounds.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]">
                  <td className="p-3 text-xs">{r.remark || "—"}</td>
                  <td className="p-3 font-mono text-xs">{r.tag}</td>
                  <td className="p-3 text-xs">{r.protocol}</td>
                  <td className="p-3 text-xs">
                    {(() => {
                      const s = tests[r.id];
                      if (s === "busy") return <span className="text-[var(--fg-subtle)]">…</span>;
                      if (!s) return <span className="text-[var(--fg-subtle)]">—</span>;
                      return s.ok ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400">
                          {s.latencyMs}ms
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-400" title={s.error || ""}>
                          fail
                        </span>
                      );
                    })()}
                  </td>
                  <td className="p-3 text-xs">
                    {(() => {
                      const s = live[r.id];
                      if (s === "busy") return <span className="text-[var(--fg-subtle)]">…</span>;
                      if (!s) return <span className="text-[var(--fg-subtle)]">—</span>;
                      const label = s.mode === "tcp" ? `${s.latencyMs}ms tcp` : `${s.latencyMs}ms`;
                      return s.ok ? (
                        <span
                          className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-400"
                          title={s.mode === "204" ? `204 in ${s.latencyMs}ms (status ${s.status ?? 204})` : s.error || ""}
                        >
                          {label}
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-400" title={s.error || ""}>
                          {s.error ? (s.error.length > 24 ? s.error.slice(0, 24) + "…" : s.error) : "fail"}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      <Button variant="secondary" className="!p-2" onClick={() => void testOne(r.id)} title={t("pages.outbounds.testButton", { defaultValue: "TCP reach test" })}>
                        <Zap className="size-4" />
                      </Button>
                      <Button variant="secondary" className="!p-2" onClick={() => void liveOne(r.id)} title={t("pages.outbounds.liveTestButton", { defaultValue: "Live 204 test (through proxy)" })}>
                        <Globe className="size-4" />
                      </Button>
                      <Button variant="danger" className="!p-2" onClick={() => del(r.id)}>
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

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t("pages.outbounds.importTitle", { defaultValue: "Import outbound URIs" })}
        width={760}
      >
        <div className="space-y-3">
          <p className="text-xs text-[var(--fg-muted)]">
            {t("pages.outbounds.importHint", {
              defaultValue: "One URI per line. Supported: vless:// vmess:// trojan:// ss:// socks:// http(s)://",
            })}
          </p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            spellCheck={false}
            placeholder="vless://uuid@host:port?type=tcp&security=tls&sni=example.com#name"
            className="block w-full min-h-[160px] resize-y rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => void parse()} disabled={parsing || !importText.trim()}>
              {parsing
                ? t("pages.outbounds.parsing", { defaultValue: "Parsing…" })
                : t("pages.outbounds.parseButton", { defaultValue: "Parse" })}
            </Button>
            <Button onClick={() => void saveAll()} disabled={saving || parsed.filter((p) => p.ok).length === 0}>
              {saving
                ? t("pages.outbounds.saving", { defaultValue: "Saving…" })
                : t("pages.outbounds.saveAllButton", {
                    count: parsed.filter((p) => p.ok).length,
                    defaultValue: `Save ${parsed.filter((p) => p.ok).length}`,
                  })}
            </Button>
          </div>
          {parsed.length > 0 ? (
            <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
              {parsed.map((p, i) => (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 text-[11px] font-mono ${
                    p.ok
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                      : "border-rose-500/40 bg-rose-500/10 text-rose-200"
                  }`}
                >
                  {p.ok && p.outbound ? (
                    <>
                      <span className="font-semibold">{p.outbound.protocol}</span>{" "}
                      <span className="opacity-80">{p.outbound.tag}</span>{" "}
                      {p.outbound.remark ? <span className="opacity-60">— {p.outbound.remark}</span> : null}
                    </>
                  ) : (
                    <>FAIL: {p.error} <span className="opacity-60">— {p.uri.slice(0, 80)}</span></>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Modal>
    </PageScaffold>
  );
}
