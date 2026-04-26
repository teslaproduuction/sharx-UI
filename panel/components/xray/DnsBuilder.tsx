"use client";

import { Plus, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import { defaultDnsForm, parseDnsSection, serializeDnsSection, type DnsFormState } from "@/lib/xrayDnsForm";
import { Button, CheckboxField, Input, SelectNative } from "@/components/ui";

type Props = {
  value: string;
  onChange: (sectionJson: string) => void;
  readOnly: boolean;
  t: TFunction;
  syncKey: string | number;
};

function asServerList(servers: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(servers)) return [];
  return servers.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
}

export function DnsBuilder({ value, onChange, readOnly, t, syncKey }: Props) {
  const [state, setState] = useState<DnsFormState>(() => defaultDnsForm());
  const lastEmitted = useRef<string | null>(null);
  const prevSyncKey = useRef(syncKey);

  const normJson = useCallback((s: string) => {
    try {
      return JSON.stringify(JSON.parse(s));
    } catch {
      return s;
    }
  }, []);

  const apply = useCallback(
    (next: DnsFormState) => {
      setState(next);
      const json = serializeDnsSection(next);
      lastEmitted.current = json;
      onChange(json);
    },
    [onChange],
  );

  useEffect(() => {
    const syncKeyBumped = prevSyncKey.current !== syncKey;
    prevSyncKey.current = syncKey;
    if (!syncKeyBumped && lastEmitted.current != null && normJson(value) === normJson(lastEmitted.current)) {
      return;
    }
    const { state: next, error } = parseDnsSection(value);
    if (error) {
      setState(defaultDnsForm());
      return;
    }
    setState(next);
    lastEmitted.current = serializeDnsSection(next);
  }, [value, syncKey, normJson]);

  const servers = asServerList(state.servers);

  return (
    <div className="space-y-3">
      <CheckboxField
        label={t("pages.xray.dnsBuilder.enableCustom")}
        checked={state.enabled}
        disabled={readOnly}
        onChange={(e) => apply({ ...state, enabled: e.target.checked })}
      />

      {state.enabled ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.dns.queryStrategy")}</label>
              <SelectNative
                className="mt-1 w-full"
                value={state.queryStrategy}
                disabled={readOnly}
                onChange={(e) => apply({ ...state, queryStrategy: e.target.value })}
              >
                <option value="UseIP">UseIP</option>
                <option value="UseIPv4">UseIPv4</option>
                <option value="UseIPv6">UseIPv6</option>
              </SelectNative>
            </div>
            <div>
              <label className="text-xs text-[var(--fg-muted)]">tag</label>
              <Input
                className="mt-1 w-full"
                value={state.tag}
                disabled={readOnly}
                onChange={(e) => apply({ ...state, tag: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--fg-muted)]">clientIp</label>
              <Input
                className="mt-1 w-full"
                value={state.clientIp}
                disabled={readOnly}
                onChange={(e) => apply({ ...state, clientIp: e.target.value })}
                placeholder="optional"
              />
            </div>
          </div>
          <div className="flex gap-4">
            <CheckboxField
              label={t("pages.xray.dnsBuilder.disableCache")}
              checked={state.disableCache}
              disabled={readOnly}
              onChange={(e) => apply({ ...state, disableCache: e.target.checked })}
            />
            <CheckboxField
              label={t("pages.xray.dnsBuilder.disableFallback")}
              checked={state.disableFallback}
              disabled={readOnly}
              onChange={(e) => apply({ ...state, disableFallback: e.target.checked })}
            />
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-[var(--fg-muted)]">{t("pages.xray.dnsBuilder.servers")}</div>
            <div className="space-y-2">
              {servers.map((srv, idx) => (
                <div
                  key={idx}
                  className="grid gap-2 rounded-lg border border-[var(--border)] p-2 sm:grid-cols-[1fr_100px_1fr_auto]"
                >
                  <div>
                    <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
                    <Input
                      className="mt-0.5 w-full"
                      value={String(srv.address ?? "")}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = servers.slice();
                        next[idx] = { ...srv, address: e.target.value };
                        apply({ ...state, servers: next });
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
                    <Input
                      type="number"
                      className="mt-0.5 w-full"
                      value={srv.port != null ? String(srv.port) : ""}
                      disabled={readOnly}
                      onChange={(e) => {
                        const next = servers.slice();
                        next[idx] = { ...srv, port: Number(e.target.value) || 0 };
                        apply({ ...state, servers: next });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-[var(--fg-muted)]">domains (one per line)</label>
                    <textarea
                      className="mt-0.5 min-h-[52px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
                      value={Array.isArray(srv.domains) ? (srv.domains as string[]).join("\n") : ""}
                      disabled={readOnly}
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean);
                        const next = servers.slice();
                        next[idx] = { ...srv, domains: lines };
                        apply({ ...state, servers: next });
                      }}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs text-[var(--fg-muted)]">expectIPs (one per line)</label>
                    <textarea
                      className="mt-0.5 min-h-[52px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
                      value={Array.isArray(srv.expectIPs) ? (srv.expectIPs as string[]).join("\n") : ""}
                      disabled={readOnly}
                      onChange={(e) => {
                        const lines = e.target.value
                          .split("\n")
                          .map((x) => x.trim())
                          .filter(Boolean);
                        const next = servers.slice();
                        next[idx] = { ...srv, expectIPs: lines };
                        apply({ ...state, servers: next });
                      }}
                    />
                  </div>
                  <div className="flex items-end justify-end sm:col-span-4">
                    <Button
                      type="button"
                      variant="secondary"
                      className="!p-1.5 text-rose-300"
                      disabled={readOnly}
                      onClick={() => {
                        const next = servers.filter((_, i) => i !== idx);
                        apply({ ...state, servers: next.length ? next : [{ address: "1.1.1.1", port: 53 }] });
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                className="!gap-2"
                disabled={readOnly}
                onClick={() =>
                  apply({
                    ...state,
                    servers: [...servers, { address: "1.1.1.1", port: 53 }],
                  })
                }
              >
                <Plus size={16} />
                {t("pages.xray.dnsBuilder.addServer")}
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.dnsBuilder.hostsHint")}</label>
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs"
              value={JSON.stringify(state.hosts, null, 2)}
              disabled={readOnly}
              onChange={(e) => {
                try {
                  apply({ ...state, hosts: JSON.parse(e.target.value) as Record<string, unknown> });
                } catch {
                  /* */
                }
              }}
            />
          </div>
        </>
      ) : (
        <p className="text-xs text-[var(--fg-subtle)]">{t("pages.xray.dnsBuilder.disabledHint")}</p>
      )}
    </div>
  );
}
