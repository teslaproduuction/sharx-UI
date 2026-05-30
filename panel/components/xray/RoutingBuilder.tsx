"use client";

import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Plus, Scale, Trash2 } from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BALANCER_STRATEGIES,
  type BalancerFormRow,
  DEFAULT_DOMAIN_STRATEGIES,
  type FieldRuleFormRow,
  type RoutingFormState,
  ROUTING_PRESETS,
  defaultRoutingForm,
  emptyBalancerRow,
  emptyRuleRow,
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
  /** Outbound tags discovered from the sibling `outbounds[]` of the same template. */
  outboundTags?: string[];
};

/** Built-in dispatch targets every Xray config has. */
const BUILTIN_OUTBOUND_TAGS = ["direct", "block"];

export function RoutingBuilder({ value, onChange, readOnly, t, syncKey, outboundTags = [] }: Props) {
  const [state, setState] = useState<RoutingFormState>(() => defaultRoutingForm());
  const [showBalancers, setShowBalancers] = useState(false);
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
    if ((next.balancers?.length ?? 0) > 0) setShowBalancers(true);
    lastEmitted.current = serializeRoutingSection(next);
  }, [value, syncKey, normJson]);

  const rules = state.rules;
  const balancers = state.balancers ?? [];

  /** Union of built-ins, sibling outbounds, and tags already referenced by rules. */
  const knownOutboundTags = useMemo(() => {
    const set = new Set<string>(BUILTIN_OUTBOUND_TAGS);
    for (const o of outboundTags) if (o.trim()) set.add(o.trim());
    for (const r of rules) if (r.outboundTag.trim()) set.add(r.outboundTag.trim());
    return Array.from(set);
  }, [outboundTags, rules]);

  const balancerTags = useMemo(
    () => balancers.map((b) => b.tag.trim()).filter(Boolean),
    [balancers],
  );

  const updateRule = (idx: number, r: FieldRuleFormRow) => {
    const next = rules.slice();
    next[idx] = r;
    apply({ ...state, rules: next });
  };
  const removeRule = (idx: number) => {
    const next = rules.filter((_, i) => i !== idx);
    apply({ ...state, rules: next.length ? next : defaultRoutingForm().rules });
  };
  const moveRule = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= rules.length) return;
    const next = rules.slice();
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    apply({ ...state, rules: next });
  };

  return (
    <div className="space-y-3">
      {/* Header explanation */}
      <p className="rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] px-3 py-2 text-xs leading-relaxed text-[var(--fg-muted)]">
        {t("pages.xray.routingBuilder.intro", {
          defaultValue:
            "Rules are evaluated top to bottom — the first match wins. Each rule sends matching traffic to an outbound (direct / block / a proxy) or a load-balancer. Use ↑/↓ to reorder.",
        })}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="max-w-xs flex-1">
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
          <p className="mt-0.5 text-[11px] text-[var(--fg-muted)]">
            {t("pages.xray.routingBuilder.domainStrategyHint", {
              defaultValue: "IPIfNonMatch resolves domains to IPs to match geoip rules.",
            })}
          </p>
        </div>
      </div>

      {/* Quick presets */}
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-[var(--fg-muted)]">
          {t("pages.xray.routingBuilder.quickRules", { defaultValue: "Quick rules" })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROUTING_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              disabled={readOnly}
              title={p.hint}
              onClick={() => apply({ ...state, rules: [...rules, p.build()] })}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] disabled:opacity-40"
            >
              <Plus size={12} />
              {t(`pages.xray.routingBuilder.presets.${p.key}`, { defaultValue: p.label })}
            </button>
          ))}
        </div>
      </div>

      {/* Balancers (collapsible — load-balancing / cascade fallback) */}
      <div className="rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={() => setShowBalancers((s) => !s)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--fg)]"
        >
          {showBalancers ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Scale size={14} className="text-[var(--accent)]" />
          {t("pages.xray.routingBuilder.balancers", { defaultValue: "Load balancers" })}
          {balancerTags.length > 0 ? (
            <span className="rounded-full bg-[var(--bg-elevated)] px-1.5 text-[10px]">{balancerTags.length}</span>
          ) : null}
        </button>
        {showBalancers ? (
          <div className="space-y-2 border-t border-[var(--border)] p-3">
            <p className="text-[11px] leading-relaxed text-[var(--fg-muted)]">
              {t("pages.xray.routingBuilder.balancersHint", {
                defaultValue:
                  "A balancer spreads traffic across several outbound tags by health/latency. Reference it from a rule's target = balancer. leastPing needs an observatory probe.",
              })}
            </p>
            {balancers.map((b, idx) => (
              <BalancerCard
                key={b.id}
                row={b}
                readOnly={readOnly}
                t={t}
                onChange={(nb) => {
                  const next = balancers.slice();
                  next[idx] = nb;
                  apply({ ...state, balancers: next });
                }}
                onRemove={() => apply({ ...state, balancers: balancers.filter((_, i) => i !== idx) })}
              />
            ))}
            <Button
              type="button"
              variant="secondary"
              className="!gap-2"
              disabled={readOnly}
              onClick={() => apply({ ...state, balancers: [...balancers, emptyBalancerRow()] })}
            >
              <Plus size={16} />
              {t("pages.xray.routingBuilder.addBalancer", { defaultValue: "Add balancer" })}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.rules")}</div>
        {rules.map((row, idx) => (
          <RoutingRuleCard
            key={row.id}
            row={row}
            index={idx}
            total={rules.length}
            readOnly={readOnly}
            t={t}
            knownOutboundTags={knownOutboundTags}
            balancerTags={balancerTags}
            onChange={(r) => updateRule(idx, r)}
            onRemove={() => removeRule(idx)}
            onMove={(dir) => moveRule(idx, dir)}
          />
        ))}
        <Button
          type="button"
          variant="secondary"
          className="!gap-2"
          disabled={readOnly}
          onClick={() => apply({ ...state, rules: [...rules, emptyRuleRow()] })}
        >
          <Plus size={16} />
          {t("pages.xray.routingBuilder.addRule")}
        </Button>
      </div>
    </div>
  );
}

function BalancerCard({
  row,
  onChange,
  onRemove,
  readOnly,
  t,
}: {
  row: BalancerFormRow;
  onChange: (r: BalancerFormRow) => void;
  onRemove: () => void;
  readOnly: boolean;
  t: TFunction;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.balancerTag", { defaultValue: "Balancer tag" })}</label>
          <Input
            className="mt-0.5 w-full"
            value={row.tag}
            disabled={readOnly}
            placeholder="balancer-eu"
            onChange={(e) => onChange({ ...row, tag: e.target.value })}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.strategy", { defaultValue: "Strategy" })}</label>
          <SelectNative
            className="mt-0.5 w-full"
            value={row.strategyType}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, strategyType: e.target.value })}
          >
            {BALANCER_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectNative>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">{t("pages.xray.routingBuilder.selector", { defaultValue: "Selector (outbound tag prefixes, one per line)" })}</label>
          <textarea
            className="mt-0.5 min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.selectorLines}
            disabled={readOnly}
            placeholder={"proxy-de\nproxy-nl"}
            onChange={(e) => onChange({ ...row, selectorLines: e.target.value })}
          />
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <Button type="button" variant="secondary" className="!p-1.5 text-rose-300" disabled={readOnly} onClick={onRemove}>
          <Trash2 size={16} />
        </Button>
      </div>
    </div>
  );
}

function RoutingRuleCard({
  row,
  index,
  total,
  onChange,
  onRemove,
  onMove,
  readOnly,
  t,
  knownOutboundTags,
  balancerTags,
}: {
  row: FieldRuleFormRow;
  index: number;
  total: number;
  onChange: (r: FieldRuleFormRow) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  readOnly: boolean;
  t: TFunction;
  knownOutboundTags: string[];
  balancerTags: string[];
}) {
  const targetMode: "outbound" | "balancer" = row.balancerTag.trim() ? "balancer" : "outbound";
  const listId = `obt-${row.id}`;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--fg-muted)]">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--bg)] text-[10px] text-[var(--fg)]">{index + 1}</span>
          {t("pages.xray.routingBuilder.rule")}
        </span>
        <div className="flex items-center gap-0.5">
          <Button type="button" variant="ghost" className="!p-1.5" disabled={readOnly || index === 0} onClick={() => onMove(-1)} title={t("moveUp", { defaultValue: "Move up" })}>
            <ArrowUp size={14} />
          </Button>
          <Button type="button" variant="ghost" className="!p-1.5" disabled={readOnly || index === total - 1} onClick={() => onMove(1)} title={t("moveDown", { defaultValue: "Move down" })}>
            <ArrowDown size={14} />
          </Button>
          <Button type="button" variant="secondary" className="!p-1.5 text-rose-300" disabled={readOnly} onClick={onRemove}>
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* Target: outbound or balancer */}
      <div className="mb-2 rounded-lg border border-dashed border-[var(--border)] p-2">
        <div className="mb-1 flex items-center gap-3">
          <label className="text-xs font-medium text-[var(--fg)]">{t("pages.xray.routingBuilder.target", { defaultValue: "Send to" })}</label>
          <div className="flex rounded-md border border-[var(--border)] text-[11px]">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => onChange({ ...row, balancerTag: "" })}
              className={`rounded-l-md px-2 py-0.5 ${targetMode === "outbound" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--fg-muted)]"}`}
            >
              {t("pages.xray.routingBuilder.targetOutbound", { defaultValue: "Outbound" })}
            </button>
            <button
              type="button"
              disabled={readOnly || balancerTags.length === 0}
              title={balancerTags.length === 0 ? t("pages.xray.routingBuilder.noBalancers", { defaultValue: "Define a balancer first" }) : undefined}
              onClick={() => onChange({ ...row, balancerTag: balancerTags[0] ?? "", outboundTag: "" })}
              className={`rounded-r-md px-2 py-0.5 disabled:opacity-40 ${targetMode === "balancer" ? "bg-[var(--accent)] text-[var(--accent-fg)]" : "text-[var(--fg-muted)]"}`}
            >
              {t("pages.xray.routingBuilder.targetBalancer", { defaultValue: "Balancer" })}
            </button>
          </div>
        </div>
        {targetMode === "outbound" ? (
          <>
            <Input
              className="w-full"
              list={listId}
              value={row.outboundTag}
              disabled={readOnly}
              placeholder="direct"
              onChange={(e) => onChange({ ...row, outboundTag: e.target.value })}
            />
            <datalist id={listId}>
              {knownOutboundTags.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </>
        ) : (
          <SelectNative
            className="w-full"
            value={row.balancerTag}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, balancerTag: e.target.value })}
          >
            {balancerTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </SelectNative>
        )}
      </div>

      {/* Match conditions */}
      <p className="mb-1 text-[11px] text-[var(--fg-muted)]">
        {t("pages.xray.routingBuilder.matchHint", { defaultValue: "Match when ALL filled conditions are satisfied (AND):" })}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">domain</label>
          <textarea
            className="mt-0.5 min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.domainLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, domainLines: e.target.value })}
            placeholder={"geosite:google\ndomain:example.com\nfull:exact.host"}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">ip</label>
          <textarea
            className="mt-0.5 min-h-[44px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.ipLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, ipLines: e.target.value })}
            placeholder={"geoip:private\n10.0.0.0/8"}
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">port</label>
          <Input
            className="mt-0.5 w-full"
            value={row.port}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, port: e.target.value })}
            placeholder="443 or 1000-2000"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--fg-muted)]">network</label>
          <SelectNative
            className="mt-0.5 w-full"
            value={row.network}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, network: e.target.value })}
          >
            <option value="">any</option>
            <option value="tcp">tcp</option>
            <option value="udp">udp</option>
            <option value="tcp,udp">tcp,udp</option>
          </SelectNative>
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">protocol</label>
          <Input
            className="mt-0.5 w-full"
            value={row.protocolLines}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, protocolLines: e.target.value })}
            placeholder="bittorrent / http / tls"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">inboundTag</label>
          <Input
            className="mt-0.5 w-full"
            value={row.inboundTag}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, inboundTag: e.target.value })}
            placeholder="api or inbound-1, inbound-2"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">source</label>
          <textarea
            className="mt-0.5 min-h-[40px] w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1.5 font-mono text-xs"
            value={row.source}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, source: e.target.value })}
            placeholder="192.168.1.0/24"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-[var(--fg-muted)]">user</label>
          <Input
            className="mt-0.5 w-full"
            value={row.user}
            disabled={readOnly}
            onChange={(e) => onChange({ ...row, user: e.target.value })}
            placeholder="client@email"
          />
        </div>
      </div>
    </div>
  );
}
