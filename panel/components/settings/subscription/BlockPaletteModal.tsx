"use client";

import { useTranslation } from "react-i18next";
import { IconTile, Modal } from "@/components/ui";
import type { SubpageBlock } from "@/lib/sharxSubpageConfig";
import { BLOCK_DESCRIPTORS } from "./blocks";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (block: SubpageBlock) => void;
  existingKinds: string[];
};

export function BlockPaletteModal({ open, onClose, onPick, existingKinds }: Props) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("subBuilder.palette.title", { defaultValue: "Add a block" })}
      width={680}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BLOCK_DESCRIPTORS.map((d) => {
          const already = existingKinds.includes(d.kind);
          return (
            <button
              key={d.kind}
              type="button"
              onClick={() => {
                onPick(d.create());
                onClose();
              }}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--surface-strong)]"
            >
              <IconTile icon={d.icon} tone={d.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="truncate text-sm font-semibold text-[var(--fg)]">
                    {t(d.labelKey)}
                  </div>
                  {already ? (
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-1.5 py-[1px] text-[10px] font-medium text-[var(--fg-subtle)]">
                      {t("subBuilder.palette.added", { defaultValue: "added" })}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[12px] leading-relaxed text-[var(--fg-muted)]">
                  {t(d.descriptionKey)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
