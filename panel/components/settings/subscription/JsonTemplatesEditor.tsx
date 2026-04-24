"use client";

import { AlertCircle, Braces, CheckCircle2 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  defaultJsonTemplates,
  type JsonTemplates,
  type SharxSubpageConfigV2,
} from "@/lib/sharxSubpageConfig";

type Props = {
  config: SharxSubpageConfigV2;
  onChange: (next: SharxSubpageConfigV2) => void;
};

type FieldKey = keyof JsonTemplates;

type FieldMeta = {
  key: FieldKey;
  labelKey: string;
  labelDefault: string;
  hintKey: string;
  hintDefault: string;
  placeholder: string;
};

const FIELDS: FieldMeta[] = [
  {
    key: "fragment",
    labelKey: "subBuilder.jsonTemplates.fragment",
    labelDefault: "Fragment",
    hintKey: "subBuilder.jsonTemplates.fragmentHint",
    hintDefault:
      "Stream-settings fragmenter (xray). Left empty = no fragmentation injected into JSON sub.",
    placeholder: '{ "packets": "tlshello", "length": "100-200", "interval": "10-20" }',
  },
  {
    key: "mux",
    labelKey: "subBuilder.jsonTemplates.mux",
    labelDefault: "Mux",
    hintKey: "subBuilder.jsonTemplates.muxHint",
    hintDefault: "Per-outbound Mux settings merged into the JSON subscription.",
    placeholder: '{ "enabled": false, "concurrency": 8 }',
  },
  {
    key: "noises",
    labelKey: "subBuilder.jsonTemplates.noises",
    labelDefault: "Noises",
    hintKey: "subBuilder.jsonTemplates.noisesHint",
    hintDefault: "Array of noise settings injected alongside fragments.",
    placeholder: '[{ "type": "rand", "packet": "1-3", "delay": "10-20" }]',
  },
  {
    key: "rules",
    labelKey: "subBuilder.jsonTemplates.rules",
    labelDefault: "Rules",
    hintKey: "subBuilder.jsonTemplates.rulesHint",
    hintDefault: "Extra routing rules prepended to the routing section of JSON sub.",
    placeholder: '[{ "type": "field", "outboundTag": "direct", "domain": ["geosite:private"] }]',
  },
];

export function JsonTemplatesEditor({ config, onChange }: Props) {
  const { t } = useTranslation();
  const templates: JsonTemplates =
    config.jsonTemplates ?? defaultJsonTemplates();

  const set = (patch: Partial<JsonTemplates>) =>
    onChange({ ...config, jsonTemplates: { ...templates, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      {FIELDS.map((f) => (
        <JsonField
          key={f.key}
          label={t(f.labelKey, { defaultValue: f.labelDefault })}
          hint={t(f.hintKey, { defaultValue: f.hintDefault })}
          placeholder={f.placeholder}
          value={templates[f.key]}
          onChange={(v) => set({ [f.key]: v } as Partial<JsonTemplates>)}
        />
      ))}
    </div>
  );
}

function JsonField({
  label,
  hint,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const trimmed = value.trim();
  const validity = useMemo<
    { state: "empty" | "valid" | "invalid"; error?: string }
  >(() => {
    if (!trimmed) return { state: "empty" };
    try {
      JSON.parse(trimmed);
      return { state: "valid" };
    } catch (err) {
      return {
        state: "invalid",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [trimmed]);

  const borderClass =
    validity.state === "invalid"
      ? "border-[color-mix(in_oklab,var(--danger)_55%,var(--border))] focus-within:border-[var(--danger)]"
      : validity.state === "valid"
        ? "border-[color-mix(in_oklab,var(--accent)_35%,var(--border))] focus-within:border-[var(--accent)]"
        : "border-[var(--border)] focus-within:border-[var(--accent)]";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          <Braces size={12} aria-hidden />
          {label}
        </div>
        {validity.state === "valid" ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--accent)]">
            <CheckCircle2 size={12} aria-hidden />
            {t("subBuilder.jsonTemplates.valid", { defaultValue: "Valid JSON" })}
          </span>
        ) : validity.state === "invalid" ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--danger)]">
            <AlertCircle size={12} aria-hidden />
            {t("subBuilder.jsonTemplates.invalid", { defaultValue: "Invalid JSON" })}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--fg-subtle)]">
            {t("subBuilder.jsonTemplates.empty", { defaultValue: "Optional" })}
          </span>
        )}
      </div>
      <div
        className={`rounded-xl border bg-[var(--bg-elevated)] transition-colors ${borderClass}`}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          rows={5}
          className="block w-full resize-y rounded-xl bg-transparent px-3 py-2 font-mono text-[12.5px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-subtle)]"
        />
      </div>
      {hint ? (
        <p className="text-[11px] text-[var(--fg-subtle)]">{hint}</p>
      ) : null}
      {validity.state === "invalid" && validity.error ? (
        <p className="text-[11px] text-[var(--danger)]">{validity.error}</p>
      ) : null}
    </div>
  );
}
