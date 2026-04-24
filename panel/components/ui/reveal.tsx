"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { listContainer, listItem, fadeUp } from "@/lib/motion";

type RevealProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children: ReactNode;
  delay?: number;
  as?: "div";
  once?: boolean;
  amount?: number | "some" | "all";
};

/** Fade+rise when entering the viewport. Skips motion for reduced-motion. */
export function Reveal({
  children,
  delay = 0,
  once = true,
  amount = 0.2,
  className = "",
  ...rest
}: RevealProps) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      variants={fadeUp}
      transition={{ delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

type StaggerProps = {
  children: ReactNode;
  className?: string;
  staggerChildren?: number;
  delayChildren?: number;
};

/** Place list of <StaggerItem>s inside; children animate sequentially. */
export function Stagger({
  children,
  className = "",
  staggerChildren = 0.05,
  delayChildren = 0.04,
}: StaggerProps) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={{
        hidden: listContainer.hidden,
        visible: {
          ...listContainer.visible,
          transition: { staggerChildren, delayChildren },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} variants={listItem}>
      {children}
    </motion.div>
  );
}
