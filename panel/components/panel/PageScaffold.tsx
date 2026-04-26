"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { listContainer, listItem } from "@/lib/motion";

type PageScaffoldProps = {
  children: ReactNode;
  /** Tighter vertical rhythm for dense lists */
  compact?: boolean;
};

/**
 * Fluid desktop container with safe side paddings.
 * On navigation, top-level blocks fade in and ease up in sequence (respects reduced motion).
 */
export function PageScaffold({ children, compact }: PageScaffoldProps) {
  const reduce = useReducedMotion();
  const outer = `mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12 ${
    compact
      ? "space-y-4 pt-3 pb-2 sm:pt-4 sm:pb-3 lg:pt-5 lg:pb-4"
      : "space-y-8 pt-4 pb-3 sm:pt-5 sm:pb-4 lg:pt-6 lg:pb-5"
  }`;

  if (reduce) {
    return <div className={outer}>{children}</div>;
  }

  return (
    <motion.div
      className={outer}
      initial="hidden"
      animate="visible"
      variants={listContainer}
    >
      {Children.map(children, (child, index) =>
        isValidElement(child) ? (
          <motion.div
            key={child.key ?? `page-block-${index}`}
            variants={listItem}
            className="min-w-0"
          >
            {child}
          </motion.div>
        ) : (
          <Fragment key={`page-text-${index}`}>{child}</Fragment>
        ),
      )}
    </motion.div>
  );
}
