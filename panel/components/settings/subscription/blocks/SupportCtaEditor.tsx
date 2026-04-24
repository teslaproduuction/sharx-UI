"use client";

import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui";
import type { BlockSupportCta } from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockSupportCta;
  onChange: (next: BlockSupportCta) => void;
};

export function SupportCtaEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <Field
        label={t("subBuilder.supportCta.title", { defaultValue: "Heading" })}
      >
        <Input
          value={block.title}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
        />
      </Field>
      <Field
        label={t("subBuilder.supportCta.text", { defaultValue: "Text" })}
      >
        <textarea
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--fg)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          rows={3}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      </Field>
      <Field
        label={t("subBuilder.supportCta.buttonLabel", { defaultValue: "Button label" })}
      >
        <Input
          value={block.buttonLabel}
          onChange={(e) => onChange({ ...block, buttonLabel: e.target.value })}
        />
      </Field>
      <Field
        label={t("subBuilder.supportCta.url", { defaultValue: "Button URL" })}
      >
        <Input
          type="url"
          placeholder="https://t.me/your_channel"
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
        {label}
      </div>
      {children}
    </label>
  );
}
