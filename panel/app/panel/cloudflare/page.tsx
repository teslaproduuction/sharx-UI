"use client";

import { Cloud, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Input, Modal, SelectNative, Spinner, useToast } from "@/components/ui";

type Credential = {
  id: number;
  name: string;
  accountId: string;
  scopeSummary: string;
  lastVerified: number;
  createdAt: number;
};

type Zone = {
  id: number;
  credentialId: number;
  cfZoneId: string;
  name: string;
  status: string;
};

type Domain = {
  id: number;
  credentialId: number;
  zoneId?: number;
  name: string;
  mode: string;
  status: string;
  originIp: string;
  workerScriptId?: string;
  lastSynced: number;
  createdAt: number;
};

const MODES = ["direct", "cdn", "worker", "auto_cdn_ip"];

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [creds, setCreds] = useState<Credential[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCredOpen, setAddCredOpen] = useState(false);
  const [credName, setCredName] = useState("default");
  const [credToken, setCredToken] = useState("");
  const [credBusy, setCredBusy] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [domName, setDomName] = useState("");
  const [domMode, setDomMode] = useState("direct");
  const [domOriginIp, setDomOriginIp] = useState("");
  const [domCredId, setDomCredId] = useState<number | null>(null);
  const [domBusy, setDomBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, d] = await Promise.all([
      getJson<Credential[]>(panel("cloudflare/credentials")),
      getJson<Domain[]>(panel("cloudflare/domains")),
    ]);
    setLoading(false);
    if (c.success && Array.isArray(c.obj)) setCreds(c.obj);
    if (d.success && Array.isArray(d.obj)) setDomains(d.obj);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addCred = async () => {
    if (!credName.trim() || !credToken.trim()) {
      toast.error(t("pages.cloudflare.credRequired", { defaultValue: "Name + token required" }));
      return;
    }
    setCredBusy(true);
    const r = await postJson(panel("cloudflare/credentials"), { name: credName.trim(), apiToken: credToken.trim() }, true);
    setCredBusy(false);
    if (r.success) {
      toast.success(t("pages.cloudflare.credSaved", { defaultValue: "Credential saved" }));
      setAddCredOpen(false);
      setCredToken("");
      void load();
    } else {
      toast.error(r.msg || t("fail"));
    }
  };

  const verify = async (id: number) => {
    const r = await postJson<{ ok: boolean; accountId: string }>(panel(`cloudflare/credentials/${id}/verify`), {}, true);
    if (r.success) {
      toast.success(t("pages.cloudflare.verified", { defaultValue: "Verified" }));
      void load();
    } else {
      toast.error(r.msg || t("fail"));
    }
  };

  const sync = async (id: number) => {
    const r = await postJson<{ count: number }>(panel(`cloudflare/credentials/${id}/sync-zones`), {}, true);
    if (r.success && r.obj) {
      toast.success(t("pages.cloudflare.zonesSynced", { count: r.obj.count, defaultValue: `Synced ${r.obj.count} zones` }));
    } else {
      toast.error(r.msg || t("fail"));
    }
  };

  const delCred = async (id: number) => {
    if (!confirm(t("pages.cloudflare.delCredConfirm", { id, defaultValue: `Delete credential #${id}?` }))) return;
    const r = await postJson(panel(`cloudflare/credentials/${id}/del`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || t("fail"));
  };

  const addDomain = async () => {
    if (!domName.trim() || !domCredId) {
      toast.error(t("pages.cloudflare.domainRequired", { defaultValue: "Domain name + credential required" }));
      return;
    }
    setDomBusy(true);
    const r = await postJson(panel("cloudflare/domains"), {
      name: domName.trim(),
      credentialId: domCredId,
      mode: domMode,
      originIp: domOriginIp.trim(),
    }, true);
    setDomBusy(false);
    if (r.success) {
      toast.success(t("pages.cloudflare.domainSaved", { defaultValue: "Domain saved" }));
      setAddDomainOpen(false);
      setDomName("");
      setDomOriginIp("");
      void load();
    } else {
      toast.error(r.msg || t("fail"));
    }
  };

  const delDomain = async (id: number) => {
    if (!confirm(t("pages.cloudflare.delDomainConfirm", { id, defaultValue: `Delete domain #${id}?` }))) return;
    const r = await postJson(panel(`cloudflare/domains/${id}/del`), {}, true);
    if (r.success) void load();
    else toast.error(r.msg || t("fail"));
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.cloudflare", { defaultValue: "Cloudflare" })}
        icon={Cloud}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.cloudflare.subtitle", { defaultValue: "CF API credentials + managed domains. Mode direct = A record only; cdn = orange-cloud proxy; worker = relay script; auto_cdn_ip = clean IP rotation." })}
        </p>
      </Surface>

      <Surface padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--fg)]">
            {t("pages.cloudflare.credentialsSection", { defaultValue: "API Credentials" })}
          </h2>
          <Button onClick={() => { setAddCredOpen(true); setCredName(`cf-${Math.random().toString(36).slice(2, 6)}`); setCredToken(""); }}>
            <KeyRound className="mr-1 size-4 inline" />
            {t("pages.cloudflare.addCredButton", { defaultValue: "Add token" })}
          </Button>
        </div>
        {loading && creds.length === 0 ? (
          <Spinner size={28} />
        ) : creds.length === 0 ? (
          <p className="text-xs text-[var(--fg-subtle)]">{t("pages.cloudflare.credEmpty", { defaultValue: "No credentials. Add a CF API token to start." })}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-2">{t("pages.cloudflare.colName", { defaultValue: "Name" })}</th>
                <th className="p-2">{t("pages.cloudflare.colAccountId", { defaultValue: "CF account" })}</th>
                <th className="p-2">{t("pages.cloudflare.colScope", { defaultValue: "Scope" })}</th>
                <th className="p-2">{t("pages.cloudflare.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {creds.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)]">
                  <td className="p-2 font-mono text-xs">{c.name}</td>
                  <td className="p-2 font-mono text-xs">{c.accountId || "—"}</td>
                  <td className="p-2 text-xs text-[var(--fg-muted)]">{c.scopeSummary || "—"}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button variant="secondary" onClick={() => void verify(c.id)}>{t("pages.cloudflare.verifyButton", { defaultValue: "Verify" })}</Button>
                      <Button variant="secondary" onClick={() => void sync(c.id)}>
                        <RefreshCw className="mr-1 size-3 inline" />
                        {t("pages.cloudflare.syncZonesButton", { defaultValue: "Sync zones" })}
                      </Button>
                      <Button variant="danger" className="!p-2" onClick={() => void delCred(c.id)}>
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

      <Surface padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--fg)]">
            {t("pages.cloudflare.domainsSection", { defaultValue: "Domains" })}
          </h2>
          <Button
            disabled={creds.length === 0}
            onClick={() => {
              setAddDomainOpen(true);
              setDomCredId(creds[0]?.id ?? null);
              setDomMode("direct");
            }}
          >
            {t("pages.cloudflare.addDomainButton", { defaultValue: "Add domain" })}
          </Button>
        </div>
        {loading && domains.length === 0 ? (
          <Spinner size={28} />
        ) : domains.length === 0 ? (
          <div className="grid min-h-32 place-items-center px-4 py-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <IconTile icon={Cloud} tone="info" size="md" />
              <p className="text-xs text-[var(--fg-subtle)]">{t("pages.cloudflare.domainsEmpty", { defaultValue: "No domains yet." })}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--fg-subtle)]">
                <th className="p-2">{t("pages.cloudflare.colDomain", { defaultValue: "Domain" })}</th>
                <th className="p-2">{t("pages.cloudflare.colMode", { defaultValue: "Mode" })}</th>
                <th className="p-2">{t("pages.cloudflare.colOrigin", { defaultValue: "Origin IP" })}</th>
                <th className="p-2">{t("pages.cloudflare.colStatus", { defaultValue: "Status" })}</th>
                <th className="p-2">{t("pages.cloudflare.colActions", { defaultValue: "Actions" })}</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id} className="border-b border-[var(--border)]">
                  <td className="p-2 font-mono text-xs">{d.name}</td>
                  <td className="p-2 text-xs">{d.mode}</td>
                  <td className="p-2 font-mono text-xs">{d.originIp || "—"}</td>
                  <td className="p-2 text-xs">{d.status}</td>
                  <td className="p-2">
                    <Button variant="danger" className="!p-2" onClick={() => void delDomain(d.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>

      <Modal open={addCredOpen} onClose={() => setAddCredOpen(false)} title={t("pages.cloudflare.addCredTitle", { defaultValue: "Add CF API token" })}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldName", { defaultValue: "Name" })}</label>
            <Input value={credName} onChange={(e) => setCredName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldToken", { defaultValue: "API token (CF dash → My Profile → API Tokens)" })}</label>
            <Input className="font-mono text-xs" value={credToken} onChange={(e) => setCredToken(e.target.value)} placeholder="abcDEF123..." />
          </div>
          <p className="text-[11px] text-[var(--fg-subtle)]">
            {t("pages.cloudflare.tokenScopeHint", { defaultValue: "Token needs Zone:Read + DNS:Edit + Workers Scripts:Edit. Token is encrypted at rest (AES-GCM)." })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddCredOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void addCred()} disabled={credBusy}>
              {credBusy ? t("saving", { defaultValue: "Saving…" }) : t("save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={addDomainOpen} onClose={() => setAddDomainOpen(false)} title={t("pages.cloudflare.addDomainTitle", { defaultValue: "Add domain" })}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldCredential", { defaultValue: "Credential" })}</label>
            <SelectNative value={String(domCredId ?? "")} onChange={(e) => setDomCredId(parseInt(e.target.value, 10) || null)}>
              {creds.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </SelectNative>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldDomainName", { defaultValue: "Domain (FQDN)" })}</label>
            <Input className="font-mono text-xs" value={domName} onChange={(e) => setDomName(e.target.value)} placeholder="vpn.example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldMode", { defaultValue: "Mode" })}</label>
            <SelectNative value={domMode} onChange={(e) => setDomMode(e.target.value)}>
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </SelectNative>
            <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">
              {t(`pages.cloudflare.modeHint.${domMode}`, {
                defaultValue: domMode === "direct" ? "A record only, no CF proxy."
                  : domMode === "cdn" ? "Proxied A record (orange cloud). CF hides origin IP."
                  : domMode === "worker" ? "Worker script relays WS/gRPC to origin."
                  : "Rotate clean CF IPs from a curated list.",
              })}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.cloudflare.fieldOriginIp", { defaultValue: "Origin IP" })}</label>
            <Input className="font-mono text-xs" value={domOriginIp} onChange={(e) => setDomOriginIp(e.target.value)} placeholder="138.16.176.11" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddDomainOpen(false)}>{t("cancel")}</Button>
            <Button onClick={() => void addDomain()} disabled={domBusy}>
              {domBusy ? t("saving", { defaultValue: "Saving…" }) : t("save")}
            </Button>
          </div>
        </div>
      </Modal>
    </PageScaffold>
  );
}
