"use client";

import { ChevronDown, Copy as CopyIcon, GripVertical, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible, IconButton, IconTile, Switch } from "@/components/ui";
import type { SubpageBlock } from "@/lib/sharxSubpageConfig";
import { BlockEditor, describeBlock } from "./blocks";

type Props = {
  block: SubpageBlock;
  onChange: (next: SubpageBlock) => void;
  onDelete: () => void;
  onClone?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver?: (e: DragEvent<HTMLDivElement>) => void;
  onDrop?: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: (e: DragEvent<HTMLDivElement>) => void;
  dropHint?: "before" | "after" | null;
  isDragging?: boolean;
};

export function BlockCard({
  block,
  onChange,
  onDelete,
  onClone,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
  dropHint,
  isDragging,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const desc = describeBlock(block);
  const blockLabel = t(desc.labelKey);
  const blockDescription = t(desc.descriptionKey);
  const Icon = desc.icon;

  const hintClass =
    dropHint === "before"
      ? "sub-block-drop-before"
      : dropHint === "after"
        ? "sub-block-drop-after"
        : "";

  return (
    <div
      className={`sub-block-draggable rounded-xl border border-[var(--border)] bg-[var(--surface)] ${
        isDragging ? "sub-block-draggable--dragging" : ""
      } ${hintClass}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          aria-label={t("subBuilder.block.drag", { defaultValue: "Drag" })}
          className="grid size-8 shrink-0 cursor-grab place-items-center rounded-lg text-[var(--fg-muted)] hover:bg-[var(--surface-strong)] active:cursor-grabbing"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <GripVertical className="size-4" />
        </button>
        <IconTile icon={Icon} tone={desc.tone} size="sm" className="mt-0.5" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-sm font-semibold text-[var(--fg)]">
              {blockLabel}
            </div>
            {!block.enabled ? (
              <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-[1px] text-[10px] font-medium text-[var(--fg-subtle)]">
                {t("subBuilder.block.disabled", { defaultValue: "disabled" })}
              </span>
            ) : null}
          </div>
          <div className="truncate text-[11px] text-[var(--fg-muted)]">
            {blockDescription}
          </div>
        </button>
        <Switch
          checked={block.enabled}
          onChange={(enabled) => onChange({ ...block, enabled })}
          size="sm"
          ariaLabel={t("enable")}
        />
        <IconButton
          onClick={() => setOpen((v) => !v)}
          label={open ? t("collapse", { defaultValue: "Collapse" }) : t("expand", { defaultValue: "Expand" })}
          className="shrink-0"
        >
          <ChevronDown
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </IconButton>
        {onClone ? (
          <IconButton
            onClick={onClone}
            label={t("subBuilder.block.clone", { defaultValue: "Clone" })}
            className="shrink-0"
          >
            <CopyIcon className="size-4" />
          </IconButton>
        ) : null}
        <IconButton
          onClick={onDelete}
          label={t("delete", { defaultValue: "Delete" })}
          className="shrink-0 !text-red-400 hover:!bg-red-500/10"
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
      <Collapsible open={open}>
        <div className="border-t border-[var(--border)] p-4">
          <BlockEditor block={block} onChange={onChange} />
        </div>
      </Collapsible>
    </div>
  );
}
