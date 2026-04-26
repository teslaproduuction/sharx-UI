"use client";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import {
  type OutboundFormRow,
  OUTBOUND_PROTOCOL_OPTIONS,
  moveRow,
  newOutboundRow,
  parseOutboundsSection,
  serializeOutboundsSection,
  updateRowProtocol,
} from "@/lib/xrayOutboundForm";
import { Button, Input, SelectNative } from "@/components/ui";

type Props = {
  value: string;
  onChange: (sectionJson: string) => void;
  readOnly: boolean;
  t: TFunction;
  /** When this changes (e.g. profile load), re-parse `value` from server */
  syncKey: string | number;
};

function asRec(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return { ...(v as Record<string, unknown>) };
  return {};
}

function asArr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function ensureVless(row: OutboundFormRow): OutboundFormRow {
  const r = { ...row, raw: { ...row.raw } };
  const s = asRec(r.raw.settings);
  let vnext = asArr<Record<string, unknown>>(s.vnext);
  if (vnext.length === 0) vnext = [{ address: "127.0.0.1", port: 443, users: [{ id: "", encryption: "none", flow: "" }] }];
  s.vnext = vnext;
  r.raw.settings = s;
  return r;
}

function ensureVmess(row: OutboundFormRow): OutboundFormRow {
  const r = { ...row, raw: { ...row.raw } };
  const s = asRec(r.raw.settings);
  let vnext = asArr<Record<string, unknown>>(s.vnext);
  if (vnext.length === 0) vnext = [{ address: "127.0.0.1", port: 443, users: [{ id: "", alterId: 0, security: "auto" }] }];
  s.vnext = vnext;
  r.raw.settings = s;
  return r;
}

function ensureTrojan(row: OutboundFormRow): OutboundFormRow {
  const r = { ...row, raw: { ...row.raw } };
  const s = asRec(r.raw.settings);
  let servers = asArr<Record<string, unknown>>(s.servers);
  if (servers.length === 0) servers = [{ address: "127.0.0.1", port: 443, password: "" }];
  s.servers = servers;
  r.raw.settings = s;
  return r;
}

function ensureSs(row: OutboundFormRow): OutboundFormRow {
  const r = { ...row, raw: { ...row.raw } };
  const s = asRec(r.raw.settings);
  let servers = asArr<Record<string, unknown>>(s.servers);
  if (servers.length === 0) servers = [{ address: "127.0.0.1", port: 443, method: "aes-256-gcm", password: "" }];
  s.servers = servers;
  r.raw.settings = s;
  return r;
}

function ensureSocksHttp(row: OutboundFormRow): OutboundFormRow {
  const r = { ...row, raw: { ...row.raw } };
  const s = asRec(r.raw.settings);
  if (row.protocol === "socks") {
    const servers = asArr<Record<string, unknown>>(s.servers);
    if (servers.length === 0) s.servers = [{ address: "127.0.0.1", port: 1080 }];
  } else {
    const servers = asArr<Record<string, unknown>>((s as { servers?: unknown }).servers);
    if (servers.length === 0) (s as { servers: unknown[] }).servers = [{ uri: "http://127.0.0.1:0" }];
  }
  r.raw.settings = s;
  return r;
}

function OutboundSettingsBody({
  row,
  onRow,
  readOnly,
  t,
}: {
  row: OutboundFormRow;
  onRow: (next: OutboundFormRow) => void;
  readOnly: boolean;
  t: TFunction;
}) {
  const st = asRec(row.raw.settings);

  const setSettings = (next: Record<string, unknown>) => {
    onRow({ ...row, raw: { ...row.raw, settings: next } });
  };

  if (row.protocol === "freedom") {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.freedomDomainStrategy")}</label>
          <Input
            className="mt-1 w-full"
            value={String(st.domainStrategy ?? "AsIs")}
            disabled={readOnly}
            onChange={(e) => setSettings({ ...st, domainStrategy: e.target.value })}
            placeholder="AsIs"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.redirect")}</label>
          <Input
            className="mt-1 w-full"
            value={String(st.redirect ?? "")}
            disabled={readOnly}
            onChange={(e) => setSettings({ ...st, redirect: e.target.value })}
            placeholder="optional"
          />
        </div>
      </div>
    );
  }

  if (row.protocol === "blackhole") {
    const res = asRec(st.response);
    const rtype = (res.type as string) || "none";
    return (
      <div className="mt-2 max-w-sm">
        <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.blackholeResponse")}</label>
        <SelectNative
          className="mt-1 w-full"
          value={rtype}
          disabled={readOnly}
          onChange={(e) => {
            const type = e.target.value;
            if (type === "none" || !type) {
              const next = { ...st };
              delete next.response;
              setSettings(next);
            } else {
              setSettings({ ...st, response: { type } });
            }
          }}
        >
          <option value="none">none</option>
          <option value="http">http</option>
        </SelectNative>
      </div>
    );
  }

  if (row.protocol === "dns") {
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("network")}</label>
          <Input
            className="mt-1 w-full"
            value={String(st.network ?? "tcp")}
            disabled={readOnly}
            onChange={(e) => setSettings({ ...st, network: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
          <Input
            className="mt-1 w-full"
            value={String(st.address ?? "")}
            disabled={readOnly}
            onChange={(e) => setSettings({ ...st, address: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
          <Input
            type="number"
            className="mt-1 w-full"
            value={st.port != null ? String(st.port) : "53"}
            disabled={readOnly}
            onChange={(e) => setSettings({ ...st, port: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    );
  }

  if (row.protocol === "vless") {
    const v = ensureVless(row);
    const s = asRec(v.raw.settings);
    const str = asRec(v.raw.streamSettings);
    const vn0 = asRec(asArr<Record<string, unknown>>(s.vnext)[0]);
    const u0 = asRec(asArr<Record<string, unknown>>(vn0.users)[0]);
    const patchStream = (patch: Record<string, unknown>) => {
      onRow({ ...v, raw: { ...v.raw, streamSettings: { ...str, ...patch } } });
    };
    return (
      <div className="mt-2 space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
            <Input
              className="mt-1 w-full"
              value={String(vn0.address ?? "")}
              disabled={readOnly}
              onChange={(e) => {
                const n = { ...vn0, address: e.target.value };
                const vnext = [...(asArr<Record<string, unknown>>(s.vnext) as Record<string, unknown>[])];
                vnext[0] = n;
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
            <Input
              type="number"
              className="mt-1 w-full"
              value={String(vn0.port ?? 443)}
              disabled={readOnly}
              onChange={(e) => {
                const n = { ...vn0, port: Number(e.target.value) || 0 };
                const vnext = [...(asArr<Record<string, unknown>>(s.vnext) as Record<string, unknown>[])];
                vnext[0] = n;
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--fg-muted)]">UUID</label>
            <Input
              className="mt-1 w-full"
              value={String(u0.id ?? "")}
              disabled={readOnly}
              onChange={(e) => {
                const users = [asRec({ ...u0, id: e.target.value })];
                const nvn = { ...vn0, users };
                const vnext = [nvn, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--fg-muted)]">flow</label>
            <Input
              className="mt-1 w-full"
              value={String(u0.flow ?? "")}
              disabled={readOnly}
              onChange={(e) => {
                const users = [asRec({ ...u0, flow: e.target.value })];
                const nvn = { ...vn0, users };
                const vnext = [nvn, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
              }}
              placeholder="xtls-rprx-vision"
            />
          </div>
        </div>
        <div className="grid gap-2 border-t border-[var(--border)] pt-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-[var(--fg-muted)]">stream network</label>
            <Input
              className="mt-1 w-full"
              value={String(str.network ?? "tcp")}
              disabled={readOnly}
              onChange={(e) => patchStream({ network: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--fg-muted)]">stream security</label>
            <Input
              className="mt-1 w-full"
              value={String(str.security ?? "none")}
              disabled={readOnly}
              onChange={(e) => patchStream({ security: e.target.value })}
              placeholder="none | tls | reality"
            />
          </div>
        </div>
      </div>
    );
  }

  if (row.protocol === "vmess") {
    const v = ensureVmess(row);
    const s = asRec(v.raw.settings);
    const vn0 = asRec(asArr<Record<string, unknown>>(s.vnext)[0]);
    const u0 = asRec(asArr<Record<string, unknown>>(vn0.users)[0]);
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
          <Input
            className="mt-1 w-full"
            value={String(vn0.address ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const n = { ...vn0, address: e.target.value };
              const vnext = [{ ...n }, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
          <Input
            type="number"
            className="mt-1 w-full"
            value={String(vn0.port ?? 443)}
            disabled={readOnly}
            onChange={(e) => {
              const n = { ...vn0, port: Number(e.target.value) || 0 };
              const vnext = [n, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">id</label>
          <Input
            className="mt-1 w-full"
            value={String(u0.id ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const users = [asRec({ ...u0, id: e.target.value })];
              const nvn = { ...vn0, users };
              const vnext = [nvn, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">alterId</label>
          <Input
            type="number"
            className="mt-1 w-full"
            value={String(u0.alterId ?? 0)}
            disabled={readOnly}
            onChange={(e) => {
              const users = [asRec({ ...u0, alterId: Number(e.target.value) || 0 })];
              const nvn = { ...vn0, users };
              const vnext = [nvn, ...asArr<Record<string, unknown>>(s.vnext).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, vnext } } });
            }}
          />
        </div>
      </div>
    );
  }

  if (row.protocol === "trojan") {
    const v = ensureTrojan(row);
    const s = asRec(v.raw.settings);
    const srv0 = asRec(asArr<Record<string, unknown>>(s.servers)[0]);
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
          <Input
            className="mt-1 w-full"
            value={String(srv0.address ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, address: e.target.value }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
          <Input
            type="number"
            className="mt-1 w-full"
            value={String(srv0.port ?? 443)}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, port: Number(e.target.value) || 0 }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">{t("password")}</label>
          <Input
            className="mt-1 w-full"
            value={String(srv0.password ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, password: e.target.value }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
      </div>
    );
  }

  if (row.protocol === "shadowsocks") {
    const v = ensureSs(row);
    const s = asRec(v.raw.settings);
    const srv0 = asRec(asArr<Record<string, unknown>>(s.servers)[0]);
    return (
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
          <Input
            className="mt-1 w-full"
            value={String(srv0.address ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, address: e.target.value }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
          <Input
            type="number"
            className="mt-1 w-full"
            value={String(srv0.port ?? 443)}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, port: Number(e.target.value) || 0 }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">method</label>
          <Input
            className="mt-1 w-full"
            value={String(srv0.method ?? "aes-256-gcm")}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, method: e.target.value }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("password")}</label>
          <Input
            className="mt-1 w-full"
            value={String(srv0.password ?? "")}
            disabled={readOnly}
            onChange={(e) => {
              const servers = [asRec({ ...srv0, password: e.target.value }), ...asArr<Record<string, unknown>>(s.servers).slice(1)];
              onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
            }}
          />
        </div>
      </div>
    );
  }

  if (row.protocol === "socks" || row.protocol === "http") {
    const v = ensureSocksHttp(row);
    const s = asRec(v.raw.settings);
    if (row.protocol === "socks") {
      const srv0 = asRec(asArr<Record<string, unknown>>((s as { servers: unknown[] }).servers)[0]);
      return (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-[var(--fg-muted)]">{t("address")}</label>
            <Input
              className="mt-1 w-full"
              value={String(srv0.address ?? "")}
              disabled={readOnly}
              onChange={(e) => {
                const servers = [asRec({ ...srv0, address: e.target.value }), ...asArr<Record<string, unknown>>((s as { servers: unknown[] }).servers).slice(1)];
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
              }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.port")}</label>
            <Input
              type="number"
              className="mt-1 w-full"
              value={String(srv0.port ?? 1080)}
              disabled={readOnly}
              onChange={(e) => {
                const servers = [asRec({ ...srv0, port: Number(e.target.value) || 0 }), ...asArr<Record<string, unknown>>((s as { servers: unknown[] }).servers).slice(1)];
                onRow({ ...v, raw: { ...v.raw, settings: { ...s, servers } } });
              }}
            />
          </div>
        </div>
      );
    }
    const u = String((s as { uri?: string }).uri ?? (asArr<Record<string, unknown>>((s as { servers: unknown[] }).servers)[0] as { uri?: string } | undefined)?.uri ?? "http://127.0.0.1:0");
    return (
      <div>
        <label className="text-xs text-[var(--fg-muted)]">uri</label>
        <Input
          className="mt-1 w-full"
          value={u}
          disabled={readOnly}
          onChange={(e) => {
            onRow({ ...v, raw: { ...v.raw, settings: { servers: [{ uri: e.target.value }] } } });
          }}
        />
      </div>
    );
  }

  if (row.protocol === "wireguard") {
    return (
      <div className="mt-2 space-y-2 text-xs text-[var(--fg-muted)]">
        <p>{t("pages.xray.outbound.wireguardHint")}</p>
        <textarea
          className="min-h-[120px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs text-[var(--fg)]"
          value={JSON.stringify(st, null, 2)}
          readOnly={readOnly}
          onChange={(e) => {
            try {
              setSettings(JSON.parse(e.target.value) as Record<string, unknown>);
            } catch {
              /* ignore */
            }
          }}
        />
      </div>
    );
  }

  if (row.protocol === "loopback") {
    return (
      <div className="mt-2 max-w-sm">
        <label className="text-xs text-[var(--fg-muted)]">inboundTag</label>
        <Input
          className="mt-1 w-full"
          value={String(st.inboundTag ?? "api")}
          disabled={readOnly}
          onChange={(e) => setSettings({ ...st, inboundTag: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-[var(--fg-muted)]">{t("pages.xray.outbound.genericProtocolHint", { protocol: row.protocol })}</p>
      <textarea
        className="min-h-[100px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs"
        value={JSON.stringify(st, null, 2)}
        readOnly={readOnly}
        onChange={(e) => {
          try {
            setSettings(JSON.parse(e.target.value) as Record<string, unknown>);
          } catch {
            /* */
          }
        }}
      />
      {row.raw.streamSettings != null ? (
        <>
          <p className="text-xs text-[var(--fg-muted)]">streamSettings</p>
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2 font-mono text-xs"
            value={JSON.stringify(row.raw.streamSettings, null, 2)}
            readOnly={readOnly}
            onChange={(e) => {
              try {
                onRow({ ...row, raw: { ...row.raw, streamSettings: JSON.parse(e.target.value) as object } });
              } catch {
                /* */
              }
            }}
          />
        </>
      ) : null}
    </div>
  );
}

export function OutboundsBuilder({ value, onChange, readOnly, t, syncKey }: Props) {
  const [rows, setRows] = useState<OutboundFormRow[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [initError, setInitError] = useState<string | null>(null);
  const lastEmitted = useRef<string | null>(null);
  const prevSyncKey = useRef(syncKey);

  const normJson = useCallback((s: string) => {
    try {
      return JSON.stringify(JSON.parse(s));
    } catch {
      return s;
    }
  }, []);

  useEffect(() => {
    const syncKeyBumped = prevSyncKey.current !== syncKey;
    prevSyncKey.current = syncKey;
    if (!syncKeyBumped && lastEmitted.current != null && normJson(value) === normJson(lastEmitted.current)) {
      return;
    }
    const { rows: next, error } = parseOutboundsSection(value);
    if (error) {
      setInitError(t("pages.xrayCoreConfigProfiles.invalidJson"));
      return;
    }
    setInitError(null);
    setRows(next!);
    lastEmitted.current = serializeOutboundsSection(next!);
  }, [value, syncKey, t, normJson]);

  const push = useCallback(
    (next: OutboundFormRow[]) => {
      setRows(next);
      const json = serializeOutboundsSection(next);
      lastEmitted.current = json;
      onChange(json);
    },
    [onChange],
  );

  if (initError) {
    return <p className="text-sm text-rose-300">{initError}</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, idx) => {
        const isOpen = open[row.id] ?? true;
        return (
          <div
            key={row.id}
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="!p-1.5"
                onClick={() => setOpen((o) => ({ ...o, [row.id]: !isOpen }))}
                aria-label="toggle"
              >
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
              <div className="min-w-[120px] flex-1">
                <label className="text-xs text-[var(--fg-muted)]">tag</label>
                <Input
                  className="mt-0.5 w-full"
                  value={row.tag}
                  readOnly={readOnly}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = rows.slice();
                    n[idx] = { ...row, tag: v, raw: { ...row.raw, tag: v } };
                    push(n);
                  }}
                />
              </div>
              <div className="min-w-[140px]">
                <label className="text-xs text-[var(--fg-muted)]">{t("protocol")}</label>
                <SelectNative
                  className="mt-0.5 w-full"
                  value={row.protocol}
                  disabled={readOnly}
                  onChange={(e) => {
                    const n = rows.slice();
                    n[idx] = updateRowProtocol(row, e.target.value);
                    push(n);
                  }}
                >
                  {OUTBOUND_PROTOCOL_OPTIONS.includes(row.protocol as (typeof OUTBOUND_PROTOCOL_OPTIONS)[number]) ? null : (
                    <option value={row.protocol}>{row.protocol}</option>
                  )}
                  {OUTBOUND_PROTOCOL_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </SelectNative>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="!p-1.5"
                  disabled={readOnly || idx === 0}
                  onClick={() => push(moveRow(rows, idx, idx - 1))}
                  aria-label="up"
                >
                  <ChevronUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!p-1.5"
                  disabled={readOnly || idx === rows.length - 1}
                  onClick={() => push(moveRow(rows, idx, idx + 1))}
                  aria-label="down"
                >
                  <ChevronDown size={16} />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!p-1.5 text-rose-300"
                  disabled={readOnly}
                  onClick={() => {
                    if (rows.length <= 1) return;
                    push(rows.filter((_, i) => i !== idx));
                  }}
                  aria-label="delete"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
            {isOpen ? (
              <OutboundSettingsBody
                row={row}
                onRow={(r) => {
                  const n = rows.slice();
                  n[idx] = r;
                  push(n);
                }}
                readOnly={readOnly}
                t={t}
              />
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        className="!gap-2"
        disabled={readOnly}
        onClick={() => push([...rows, newOutboundRow("freedom")])}
      >
        <Plus size={16} />
        {t("pages.xray.outbound.add")}
      </Button>
    </div>
  );
}
