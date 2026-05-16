"use client";

import { Cloud } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { Button, IconTile, Input, Spinner, useToast } from "@/components/ui";

type WarpAccount = {
  id: number;
  name: string;
  deviceId: string;
  accountId: string;
  publicKey: string;
  isPlus: boolean;
  ipv4Address: string;
  ipv6Address?: string;
  peerEndpoint: string;
  peerPublicKey: string;
  reserved?: string;
  refreshedAt: number;
};

export default function Page() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<WarpAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("warp-1");
  const [licenseInputs, setLicenseInputs] = useState<Record<number, string>>({});
  const [jsonViewerId, setJsonViewerId] = useState<number | null>(null);
  const [jsonViewerText, setJsonViewerText] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<WarpAccount[]>(panel("warp-account/list"));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) {
      setRows(r.obj);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error(t("pages.warpAccounts.nameRequired", { defaultValue: "Name is required" }));
      return;
    }
    setBusy(true);
    const r = await postJson(panel("warp-account/register"), { name: trimmed }, true);
    setBusy(false);
    if (r.success) {
      toast.success(t("pages.warpAccounts.registeredToast", { defaultValue: "Registered" }));
      void load();
    } else {
      toast.error(r.msg || t("fail", { defaultValue: "Failed" }));
    }
  };

  const onDelete = async (id: number) => {
    const msg = t("pages.warpAccounts.deleteConfirm", { id, defaultValue: `Delete WARP account #${id}? CF device will be removed.` });
    if (!confirm(msg)) return;
    const r = await postJson(panel(`warp-account/del/${id}`), {}, true);
    if (r.success) {
      void load();
    } else {
      toast.error(r.msg || t("fail", { defaultValue: "Failed" }));
    }
  };

  const onApplyLicense = async (id: number) => {
    const lic = (licenseInputs[id] || "").trim();
    if (!lic) {
      toast.error(t("pages.warpAccounts.licenseRequired", { defaultValue: "License key required" }));
      return;
    }
    const r = await postJson(panel(`warp-account/license/${id}`), { license: lic }, true);
    if (r.success) {
      toast.success(t("pages.warpAccounts.licenseApplied", { defaultValue: "License applied" }));
      setLicenseInputs((m) => ({ ...m, [id]: "" }));
      void load();
    } else {
      toast.error(r.msg || t("fail", { defaultValue: "Failed" }));
    }
  };

  const onShowJSON = async (id: number) => {
    const r = await getJson<{ json: string }>(panel(`warp-account/outbound-json/${id}`));
    if (r.success && r.obj?.json) {
      setJsonViewerText(r.obj.json);
      setJsonViewerId(id);
    } else {
      toast.error(r.msg || t("fail", { defaultValue: "Failed" }));
    }
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.warpAccounts", { defaultValue: "WARP Accounts" })}
        icon={Cloud}
        iconTone="info"
      />
      <Surface padding="md" className="space-y-3">
        <p className="text-xs text-[var(--fg-muted)]">
          {t("pages.warpAccounts.subtitle", { defaultValue: "Anonymous Cloudflare WARP registrations. Each row produces an Xray-native wireguard outbound tagged warp-<name> that you can target from RoutingBuilder. WARP+ license unlocks unlimited speed." })}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs text-[var(--fg-muted)]">{t("pages.warpAccounts.nameLabel", { defaultValue: "Name" })}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pages.warpAccounts.namePlaceholder", { defaultValue: "warp-uk1" })} />
          </div>
          <Button onClick={onAdd} disabled={busy}>
            {busy ? t("pages.warpAccounts.registering", { defaultValue: "Registering…" }) : t("pages.warpAccounts.addButton", { defaultValue: "Add WARP" })}
          </Button>
        </div>
      </Surface>
      <Surface padding="none" className="overflow-hidden">
        {loading && rows.length === 0 ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={Cloud} tone="info" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">
                {t("pages.warpAccounts.emptyState", { defaultValue: 'No WARP accounts yet. Click "Add WARP" to register one against the Cloudflare anonymous-device endpoint.' })}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th className="p-3">{t("pages.warpAccounts.colName", { defaultValue: "Name" })}</th>
                  <th className="p-3">{t("pages.warpAccounts.colIPv4", { defaultValue: "IPv4" })}</th>
                  <th className="p-3">{t("pages.warpAccounts.colPeer", { defaultValue: "Peer" })}</th>
                  <th className="p-3">{t("pages.warpAccounts.colPlus", { defaultValue: "Plus" })}</th>
                  <th className="p-3">{t("pages.warpAccounts.colLicense", { defaultValue: "License" })}</th>
                  <th className="p-3">{t("pages.warpAccounts.colActions", { defaultValue: "Actions" })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                  >
                    <td className="p-3 font-mono text-xs text-[var(--fg)]">{row.name}</td>
                    <td className="p-3 font-mono text-xs">{row.ipv4Address}</td>
                    <td className="p-3 font-mono text-xs">{row.peerEndpoint}</td>
                    <td className="p-3">
                      {row.isPlus ? (
                        <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] text-green-500">{t("pages.warpAccounts.plusLabel", { defaultValue: "PLUS" })}</span>
                      ) : (
                        <span className="text-[10px] text-[var(--fg-subtle)]">{t("pages.warpAccounts.freeLabel", { defaultValue: "free" })}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Input
                          className="font-mono text-xs w-40"
                          placeholder={t("pages.warpAccounts.licensePlaceholder", { defaultValue: "WARP+ license" })}
                          value={licenseInputs[row.id] ?? ""}
                          onChange={(e) =>
                            setLicenseInputs((m) => ({ ...m, [row.id]: e.target.value }))
                          }
                        />
                        <Button variant="secondary" onClick={() => onApplyLicense(row.id)}>
                          {t("pages.warpAccounts.applyLicenseButton", { defaultValue: "Apply" })}
                        </Button>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="secondary" onClick={() => onShowJSON(row.id)}>
                          {t("pages.warpAccounts.showJsonButton", { defaultValue: "JSON" })}
                        </Button>
                        <Button variant="danger" onClick={() => onDelete(row.id)}>
                          {t("pages.warpAccounts.deleteButton", { defaultValue: "Del" })}
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
      {jsonViewerId !== null ? (
        <Surface padding="md" className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[var(--fg)]">
              {t("pages.warpAccounts.jsonViewerTitle", { id: jsonViewerId, defaultValue: `Xray outbound JSON — warp-account #${jsonViewerId}` })}
            </p>
            <Button variant="secondary" onClick={() => setJsonViewerId(null)}>
              {t("pages.warpAccounts.closeButton", { defaultValue: "Close" })}
            </Button>
          </div>
          <pre className="max-h-96 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-[11px] font-mono text-[var(--fg)]">
            {jsonViewerText}
          </pre>
        </Surface>
      ) : null}
    </PageScaffold>
  );
}
