"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "./button";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  /** Merged into the fixed full-screen wrapper (e.g. z-index for stacking) */
  portalClassName?: string;
  closeOnEscape?: boolean;
  lockBodyScroll?: boolean;
  closable?: boolean;
};

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  width = 520,
  portalClassName,
  closeOnEscape = true,
  lockBodyScroll = true,
  closable = true,
}: DrawerProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, closeOnEscape]);

  useEffect(() => {
    if (!lockBodyScroll) return;
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, lockBodyScroll]);

  if (typeof document === "undefined") return null;

  const w = typeof width === "number" ? `${width}px` : width;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className={`fixed inset-0 z-[95] ${portalClassName ?? ""}`}>
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label={t("close")}
            onClick={onClose}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 flex max-h-[100dvh] w-full flex-col overflow-hidden border-l border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl"
            style={{ maxWidth: w }}
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          >
            {(title != null || closable) && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div className="min-w-0 text-lg font-semibold text-[var(--fg)]">
                  {title}
                </div>
                {closable ? (
                  <Button
                    variant="ghost"
                    className="!p-2"
                    onClick={onClose}
                    aria-label={t("close")}
                  >
                    <X size={18} />
                  </Button>
                ) : null}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[var(--fg)]">
              {children}
            </div>
            {footer != null && (
              <div className="shrink-0 border-t border-[var(--border)] px-5 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
