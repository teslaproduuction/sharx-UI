"use client";

import { Plus, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_DOMAIN_STRATEGIES,
  type FieldRuleFormRow,
  type RoutingFormState,
  defaultRoutingForm,
  parseRoutingSection,
  serializeRoutingSection,
} from "@/lib/xrayRoutingForm";
import { Button, Input, SelectNative } from "@/components/ui";

type Props = {
  value: string;
  onChange: (sectionJson: string) => void;
  readOnly: boolean;
  t: TFunction;
  syncKey: string | number;
};

export function RoutingBuilder({ value, onChange, readOnly, t, syncKey }: Props) {
  const [state, setState] = useState<RoutingFormState>(() => defaultRoutingForm());
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
    (next: RoutingFormState) => {
      setState(next);
      const json = serializeRoutingSection(next);
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
    const { state: next, error } = parseRoutingSection(value);
    if (error || !next) {
      setState(defaultRoutingForm());
      return;
    }
    setState(next);
    lastEmitted.current = serializeRoutingSection(next);
  }, [value, syncKey, normJson]);

  const rules = state.rules;

  return (
    <div className="space-y-3">
      <div className="max-w-xs">
        <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.routing.domainStrategy")}</label>
        <SelectNative
          className="mt-1 w-full"
          value={state.domainStrategy}
          disabled={readOnly}
          onChange={(e) => apply({ ...state, domainStrategy: e.target.value })}
        >
          {DEFAULT_DOMAIN_STRATEGIES.map((ds) => (
            <option key={ds} value={ds}>
              {ds}
            </option>
          ))}
          {!DEFAULT_DOMAIN_STRATEGIES.includes(state.domainStrategy as (typeof DEFAULT_DOMAIN_STRATEGIES)[number]) ? (
            <option value={state.domainStrategy}>{state.domainStrategy}</option>
          ) : null}
        </SelectNative>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.rules")}</div>
        {rules.map((row, idx) => (
          <RoutingRuleCard
            key={row.id}
            row={row}
            readOnly={readOnly}
            t={t}
            onChange={(r) => {
              const next = rules.slice();
              next[idx] = r;
              apply({ ...state, rules: next });
            }}
            onRemove={() => {
              const next = rules.filter((_, i) => i !== idx);
              apply({ ...state, rules: next.length ? next : defaultRoutingForm().rules });
            }}
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          className="!gap-2"
          disabled={readOnly}
          onClick={() =>
            apply({
              ...state,
              rules: [
                ...rules,
                {
                  id: `r-${Date.now()}`,
                  outboundTag: "",
                  domainLines: "",
                  ipLines: "",
                  port: "",
                  network: "",
                  protocolLines: "",
                  inboundTag: "",
                  source: "",
                  user: "",
                },
              ],
            })
          }
        >
          <Plus size={16} />
          {t("pages.xray.routingBuilder.addRule")}
        </Button>
      </div>
    </div>
  );
}

function RoutingRuleCard({
  row,
  onChange,
  onRemove,
  readOnly,
  t,
}: {
  row: FieldRuleFormRow;
  onChange: (r: FieldRuleFormRow) => void;
  onRemove: () => void;
  readOnly: boolean;
  t: TFunction;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.rule")}</span>
        <Button type="button" variant="secondary" className="!p-1.5 text-rose-300" disabled={readOnly} onClick={onRemove}>
          <Trash2 size={16} />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">outboundTag</label>
          <Input
            className="mt-0.5 w-full"
            value={row.outboundTag}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, outboundTag: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">domain</label>
          <textarea
            className="mt-0.5 min-h-[48px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.domainLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, domainLines: e.target.value })}
            placeholder="geosite:cn"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">ip</label>
          <textarea
            className="mt-0.5 min-h-[48px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.ipLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, ipLines: e.target.value })}
            placeholder="geoip:private"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">port</label>
          <Input
            className="mt-0.5 w-full"
            value={row.port}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, port: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">network</label>
          <Input
            className="mt-0.5 w-full"
            value={row.network}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, network: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">protocol</label>
          <Input
            className="mt-0.5 w-full"
            value={row.protocolLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, protocolLines: e.target.value })}
            placeholder="bittorrent"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">inboundTag</label>
          <Input
            className="mt-0.5 w-full"
            value={row.inboundTag}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, inboundTag: e.target.value })}
            placeholder="api or api, other"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">source</label>
          <textarea
            className="mt-0.5 min-h-[40px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.source}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, source: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">user</label>
          <Input
            className="mt-0.5 w-full"
            value={row.user}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, user: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
