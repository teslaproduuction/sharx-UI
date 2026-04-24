"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconButton, Input } from "@/components/ui";
import {
  defaultResponseRules,
  type ResponseRules,
  type SharxSubpageConfigV2,
} from "@/lib/sharxSubpageConfig";

type Props = {
  config: SharxSubpageConfigV2;
  onChange: (next: SharxSubpageConfigV2) => void;
};

export function ResponseRulesEditor({ config, onChange }: Props) {
  const { t } = useTranslation();
  const rules: ResponseRules = config.responseRules ?? defaultResponseRules();

  const set = (patch: Partial<ResponseRules>) =>
    onChange({ ...config, responseRules: { ...rules, ...patch } });

  const setHeader = (idx: number, patch: Partial<{ key: string; value: string }>) => {
    const next = rules.extraHeaders.map((h, i) => (i === idx ? { ...h, ...patch } : h));
    set({ extraHeaders: next });
  };

  const addHeader = () =>
    set({ extraHeaders: [...rules.extraHeaders, { key: "", value: "" }] });

  const removeHeader = (idx: number) =>
    set({ extraHeaders: rules.extraHeaders.filter((_, i) => i !== idx) });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("subBuilder.responseRules.profileTitle", {
            defaultValue: "Profile title",
          })}
          hint={t("subBuilder.responseRules.profileTitleHint", {
            defaultValue:
              "Sent as Profile-Title (base64). Happ allows up to 25 chars.",
          })}
        >
          <Input
            value={rules.profileTitle}
            onChange={(e) => set({ profileTitle: e.target.value })}
            placeholder="My VPN"
            maxLength={200}
          />
        </Field>

        <Field
          label={t("subBuilder.responseRules.updateInterval", {
            defaultValue: "Profile update interval (hours)",
          })}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={rules.profileUpdateInterval}
            onChange={(e) =>
              set({
                profileUpdateInterval: Math.max(
                  0,
                  parseInt(e.target.value || "0", 10) || 0,
                ),
              })
            }
            placeholder="12"
          />
        </Field>
      </div>

      <Field
        label={t("subBuilder.responseRules.announce", {
          defaultValue: "Announce message",
        })}
        hint={t("subBuilder.responseRules.announceHint", {
          defaultValue: "Shown in-app (max 200 chars). Clients can override per-user.",
        })}
      >
        <Input
          value={rules.announce}
          onChange={(e) => set({ announce: e.target.value })}
          placeholder="Maintenance window on Friday 22:00 UTC"
          maxLength={200}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={t("subBuilder.responseRules.supportUrl", {
            defaultValue: "Support URL (header)",
          })}
          hint={t("subBuilder.responseRules.supportUrlHint", {
            defaultValue: "Support-Url header. Empty to omit.",
          })}
        >
          <Input
            value={rules.supportUrl}
            onChange={(e) => set({ supportUrl: e.target.value })}
            placeholder="https://t.me/your_support"
            type="url"
          />
        </Field>

        <Field
          label={t("subBuilder.responseRules.profileWebPageUrl", {
            defaultValue: "Profile web page URL",
          })}
          hint={t("subBuilder.responseRules.profileWebPageUrlHint", {
            defaultValue: "Profile-Web-Page-Url header, shown as a link in some clients.",
          })}
        >
          <Input
            value={rules.profileWebPageUrl}
            onChange={(e) => set({ profileWebPageUrl: e.target.value })}
            placeholder="https://example.com/account"
            type="url"
          />
        </Field>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--fg)]">
              {t("subBuilder.responseRules.extraHeaders", {
                defaultValue: "Extra headers",
              })}
            </div>
            <p className="text-[11px] text-[var(--fg-subtle)]">
              {t("subBuilder.responseRules.extraHeadersHint", {
                defaultValue:
                  "Any additional HTTP headers sent with the subscription response (e.g. Sub-Info-Color).",
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={addHeader}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1 text-xs font-medium text-[var(--fg)] transition-colors hover:border-[var(--accent)]"
          >
            <Plus size={14} />
            {t("subBuilder.responseRules.addHeader", { defaultValue: "Add header" })}
          </button>
        </div>

        {rules.extraHeaders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--fg-subtle)]">
            {t("subBuilder.responseRules.extraHeadersEmpty", {
              defaultValue: "No extra headers configured.",
            })}
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.extraHeaders.map((h, i) => (
              <li
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] items-center gap-2"
              >
                <Input
                  value={h.key}
                  onChange={(e) => setHeader(i, { key: e.target.value })}
                  placeholder="Sub-Info-Color"
                />
                <Input
                  value={h.value}
                  onChange={(e) => setHeader(i, { value: e.target.value })}
                  placeholder="blue"
                />
                <IconButton
                  label={t("delete", { defaultValue: "Delete" })}
                  onClick={() => removeHeader(i)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {label}
      </div>
      {children}
      {hint ? (
        <p className="mt-1 text-[11px] text-[var(--fg-subtle)]">{hint}</p>
      ) : null}
    </label>
  );
}
