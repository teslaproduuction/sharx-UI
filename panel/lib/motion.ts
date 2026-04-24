import type { Transition, Variants } from "framer-motion";

export const easeStandard = [0.22, 1, 0.36, 1] as const;
export const easeOutSoft = [0.16, 1, 0.3, 1] as const;

export const durations = {
  fast: 0.15,
  base: 0.22,
  slow: 0.42,
} as const;

export const spring: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 30,
  mass: 0.9,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.slow, ease: easeStandard },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easeStandard },
  },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.base, ease: easeStandard } },
  exit: { opacity: 0, transition: { duration: durations.fast, ease: easeStandard } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: durations.base, ease: easeStandard },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: durations.fast, ease: easeStandard },
  },
};

export const listContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.04,
    },
  },
};

export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.slow, ease: easeStandard },
  },
};

export const tabContentVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easeStandard },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easeStandard },
  },
};
