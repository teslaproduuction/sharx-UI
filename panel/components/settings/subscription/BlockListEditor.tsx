"use client";

import { Plus, Sparkles } from "lucide-react";
import { useCallback, useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui";
import { genBlockId, type SubpageBlock } from "@/lib/sharxSubpageConfig";
import { BlockCard } from "./BlockCard";
import { BlockPaletteModal } from "./BlockPaletteModal";

type Props = {
  blocks: SubpageBlock[];
  onChange: (next: SubpageBlock[]) => void;
};

export function BlockListEditor({ blocks, onChange }: Props) {
  const { t } = useTranslation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    where: "before" | "after";
  } | null>(null);

  const updateAt = useCallback(
    (id: string, next: SubpageBlock) => {
      onChange(blocks.map((b) => (b.id === id ? next : b)));
    },
    [blocks, onChange],
  );

  const removeAt = useCallback(
    (id: string) => onChange(blocks.filter((b) => b.id !== id)),
    [blocks, onChange],
  );

  const cloneAt = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx < 0) return;
      const original = blocks[idx]!;
      const clone = { ...original, id: genBlockId() } as SubpageBlock;
      const next = [...blocks];
      next.splice(idx + 1, 0, clone);
      onChange(next);
    },
    [blocks, onChange],
  );

  const addBlock = useCallback(
    (block: SubpageBlock) => onChange([...blocks, block]),
    [blocks, onChange],
  );

  const handleDragStart = (id: string) => (e: DragEvent<HTMLDivElement>) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", id);
    } catch {
      /* noop */
    }
  };
  const handleDragEnd = () => {
    setDraggingId(null);
    setDropTarget(null);
  };
  const handleDragOver = (id: string) => (e: DragEvent<HTMLDivElement>) => {
    if (!draggingId || draggingId === id) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const where: "before" | "after" =
      e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    setDropTarget((prev) =>
      prev?.id === id && prev.where === where ? prev : { id, where },
    );
  };
  const handleDragLeave = (id: string) => () => {
    setDropTarget((prev) => (prev?.id === id ? null : prev));
  };
  const handleDrop = (id: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingId || draggingId === id) {
      setDropTarget(null);
      setDraggingId(null);
      return;
    }
    const srcIdx = blocks.findIndex((b) => b.id === draggingId);
    const dstIdx = blocks.findIndex((b) => b.id === id);
    if (srcIdx < 0 || dstIdx < 0) {
      setDropTarget(null);
      setDraggingId(null);
      return;
    }
    const target = e.currentTarget as HTMLDivElement;
    const rect = target.getBoundingClientRect();
    const where: "before" | "after" =
      e.clientY - rect.top < rect.height / 2 ? "before" : "after";

    const next = [...blocks];
    const [picked] = next.splice(srcIdx, 1);
    let insertAt = next.findIndex((b) => b.id === id);
    if (where === "after") insertAt += 1;
    next.splice(insertAt, 0, picked);
    onChange(next);
    setDropTarget(null);
    setDraggingId(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {blocks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center">
          <div className="mx-auto mb-2 inline-flex size-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--accent)]">
            <Sparkles className="size-5" />
          </div>
          <div className="text-sm font-semibold text-[var(--fg)]">
            {t("subBuilder.empty.title", { defaultValue: "No blocks yet" })}
          </div>
          <div className="mt-1 text-[12px] text-[var(--fg-muted)]">
            {t("subBuilder.empty.text", {
              defaultValue: "Pick a block from the palette to start building the page.",
            })}
          </div>
        </div>
      ) : (
        <AnimatePresence initial={false}>
          {blocks.map((b) => (
            <BlockCard
              key={b.id}
              block={b}
              onChange={(n) => updateAt(b.id, n)}
              onDelete={() => removeAt(b.id)}
              onClone={() => cloneAt(b.id)}
              draggable
              onDragStart={handleDragStart(b.id)}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver(b.id)}
              onDragLeave={handleDragLeave(b.id)}
              onDrop={handleDrop(b.id)}
              dropHint={dropTarget?.id === b.id ? dropTarget.where : null}
              isDragging={draggingId === b.id}
            />
          ))}
        </AnimatePresence>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={() => setPaletteOpen(true)}
        className="!justify-center"
      >
        <Plus className="size-4" />
        {t("subBuilder.addBlock", { defaultValue: "Add block" })}
      </Button>

      <BlockPaletteModal
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onPick={addBlock}
        existingKinds={blocks.map((b) => b.kind)}
      />
    </div>
  );
}
