"use client";

import { Check, Copy, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FieldType } from "@/lib/database";
import { Switch } from "@/components/ui/switch";

type EditableCellProps = {
  value: unknown;
  fieldType: FieldType;
  onSave: (newValue: unknown) => void;
  onCancel: () => void;
};

function parseForEdit(value: unknown, fieldType: FieldType): string {
  if (value == null) return "";
  if (fieldType === "json") {
    try {
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (fieldType === "date" && value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function parseForSave(raw: string, fieldType: FieldType): unknown {
  if (raw === "") return null;
  if (fieldType === "number") {
    const n = Number(raw);
    return isNaN(n) ? raw : n;
  }
  if (fieldType === "json") {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function EditableCell({ value, fieldType, onSave, onCancel }: EditableCellProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => parseForEdit(value, fieldType));
  const [boolDraft, setBoolDraft] = useState<boolean>(() => Boolean(value));
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const commit = useCallback(() => {
    if (fieldType === "boolean") {
      onSave(boolDraft);
    } else {
      onSave(parseForSave(draft, fieldType));
    }
  }, [draft, boolDraft, fieldType, onSave]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
    if (e.key === "Escape") {
      onCancel();
    }
  };

  const actionBtns = (
    <div className="mt-1 flex gap-1">
      <button
        type="button"
        onClick={commit}
        className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[color-mix(in_oklab,var(--accent)_28%,transparent)]"
      >
        <Check className="size-3" />
        {t("pages.dbInspector.save")}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)]"
      >
        <X className="size-3" />
        {t("pages.dbInspector.cancel")}
      </button>
    </div>
  );

  if (fieldType === "boolean") {
    return (
      <div className="flex flex-col gap-1 py-0.5">
        <Switch checked={boolDraft} onChange={setBoolDraft} size="sm" />
        {actionBtns}
      </div>
    );
  }

  if (fieldType === "json") {
    return (
      <div className="flex flex-col">
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={5}
          className="w-full min-w-[220px] resize-y rounded-lg border border-[var(--accent)] bg-[var(--bg)] p-2 font-mono text-xs text-[var(--fg)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        {actionBtns}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={fieldType === "date" ? "date" : fieldType === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-7 w-full min-w-[120px] rounded-lg border border-[var(--accent)] bg-[var(--bg)] px-2 text-xs text-[var(--fg)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
      {actionBtns}
    </div>
  );
}

// ─── Read-only cell display ───────────────────────────────────────────────────

type CellDisplayProps = {
  value: unknown;
  fieldType: FieldType;
  onEdit?: () => void;
};

export function CellDisplay({ value, fieldType, onEdit }: CellDisplayProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyValue = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  if (value == null) {
    return (
      <span
        className="cursor-pointer select-none italic text-[var(--fg-subtle)] text-xs"
        onClick={onEdit}
      >
        null
      </span>
    );
  }

  if (fieldType === "boolean") {
    return (
      <span
        className={`cursor-pointer select-none rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
          value
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-red-500/10 text-red-400"
        }`}
        onClick={onEdit}
      >
        {value ? "true" : "false"}
      </span>
    );
  }

  if (fieldType === "json") {
    const preview =
      typeof value === "string"
        ? value.slice(0, 60)
        : JSON.stringify(value).slice(0, 60);
    return (
      <div className="group relative flex items-center gap-1">
        <span
          className="cursor-pointer font-mono text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
          onClick={onEdit}
          title={t("pages.dbInspector.clickEditJson")}
        >
          {preview}
          {preview.length >= 60 ? "…" : ""}
        </span>
        <button
          type="button"
          onClick={copyValue}
          className="ml-1 hidden rounded p-0.5 text-[var(--fg-subtle)] transition-colors hover:text-[var(--fg)] group-hover:flex"
          aria-label={t("pages.dbInspector.copyCellValue")}
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
        </button>
      </div>
    );
  }

  const text = fieldType === "date" && typeof value === "string"
    ? value.slice(0, 10)
    : String(value);

  return (
    <div className="group relative flex items-center gap-1">
      <span
        className="cursor-pointer truncate text-xs text-[var(--fg)] hover:text-[var(--accent)]"
        onClick={onEdit}
        title={text}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={copyValue}
        className="ml-1 hidden shrink-0 rounded p-0.5 text-[var(--fg-subtle)] transition-colors hover:text-[var(--fg)] group-hover:flex"
        aria-label={t("pages.dbInspector.copyCellValue")}
      >
        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}
