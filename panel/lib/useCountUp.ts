"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  duration?: number;
  decimals?: number;
  enabled?: boolean;
};

/**
 * Lightweight count-up animation hook. Reacts to `target` changes and ramps
 * toward the new value using an ease-out cubic.
 */
export function useCountUp(target: number, opts: Options = {}) {
  const { duration = 900, decimals = 0, enabled = true } = opts;
  const [value, setValue] = useState<number>(enabled ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(enabled ? 0 : target);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setValue(target);
      return;
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }

    fromRef.current = value;
    startedAtRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAtRef.current;
      const t = Math.min(1, Math.max(0, elapsed / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = fromRef.current + (target - fromRef.current) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, enabled, duration]);

  const pow = Math.pow(10, decimals);
  return Math.round(value * pow) / pow;
}
