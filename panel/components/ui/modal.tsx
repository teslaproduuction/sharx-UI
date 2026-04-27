"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  dialogClassName?: string;
  bodyClassName?: string;
  /** Merged into the fixed full-screen wrapper (e.g. z-index for stacked modals) */
  portalClassName?: string;
  /** When false, Escape does not call onClose (for stacking: only top dialog handles Escape) */
  closeOnEscape?: boolean;
  /** When false, does not set document.body overflow (nested modal over an open dialog) */
  lockBodyScroll?: boolean;
  /** show X in header */
  closable?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 640,
  dialogClassName,
  bodyClassName,
  portalClassName,
  closeOnEscape = true,
  lockBodyScroll = true,
  closable = true,
}: ModalProps) {
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
        <div
          className={`fixed inset-0 z-[90] flex items-center justify-center p-4 ${portalClassName ?? ""}`}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={onClose}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            className={`relative z-10 flex max-h-[min(90vh,900px)] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-2xl ${dialogClassName ?? ""}`}
            style={{ maxWidth: w }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
          >
            {(title != null || closable) && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
                <div className="min-w-0 text-lg font-semibold text-[var(--fg)]">{title}</div>
                {closable ? (
                  <Button
                    variant="ghost"
                    className="!p-2"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <X size={18} />
                  </Button>
                ) : null}
              </div>
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto p-5 text-[var(--fg)] ${bodyClassName ?? ""}`}>
              {children}
            </div>
            {footer != null && (
              <div className="shrink-0 border-t border-[var(--border)] px-5 py-4">{footer}</div>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
