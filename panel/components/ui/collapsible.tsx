"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type CollapsibleProps = {
  open: boolean;
  children: ReactNode;
  className?: string;
  durationMs?: number;
};

/** Animate height from 0 to auto. Wraps children in a motion div. */
export function Collapsible({
  open,
  children,
  className = "",
  durationMs = 240,
}: CollapsibleProps) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={`overflow-hidden ${className}`}
          initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: durationMs / 1000, ease: [0.22, 1, 0.36, 1] }}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
