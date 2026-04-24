"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check, Link2, Server } from "lucide-react";
import { useTranslation } from "react-i18next";

type Phase = "create" | "verify";

type Props = {
  phase: Phase;
  isError: boolean;
};

/**
 * Centered “connection / registration” visual for the add-node wizard.
 */
export function NodeRegisterStep({ phase, isError }: Props) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const pulse = !reduce;
  const stepIndex = phase === "verify" ? 1 : 0;

  return (
    <div className="flex min-h-56 flex-col items-center justify-center gap-6 py-2">
      <div className="relative grid h-28 w-28 shrink-0 place-items-center">
        {pulse ? (
          <>
            <motion.span
              className="absolute inline-block h-full w-full rounded-full border-2 border-[color-mix(in_oklab,var(--accent)_50%,transparent)]"
              initial={{ scale: 0.85, opacity: 0.4 }}
              animate={{ scale: 1.15, opacity: 0 }}
              transition={{
                duration: 2.2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeOut",
              }}
            />
            <motion.span
              className="absolute inline-block h-[70%] w-[70%] rounded-full border border-[color-mix(in_oklab,var(--accent)_35%,transparent)]"
              initial={{ scale: 0.9, opacity: 0.5 }}
              animate={{ scale: 1.1, opacity: 0 }}
              transition={{
                duration: 1.6,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeOut",
                delay: 0.3,
              }}
            />
          </>
        ) : null}
        <motion.div
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-[var(--accent)]"
          initial={false}
          animate={
            isError
              ? { scale: 0.95 }
              : { scale: [1, 1.04, 1] }
          }
          transition={isError ? { duration: 0.2 } : { duration: 1.8, repeat: Number.POSITIVE_INFINITY }}
        >
          <Link2 size={30} strokeWidth={1.75} />
        </motion.div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {(
          [
            { key: "create", i: 0, icon: Server },
            { key: "verify", i: 1, icon: Link2 },
          ] as const
        ).map(({ key, i, icon: Icon }) => {
          const done = stepIndex > i;
          const active = stepIndex === i && !isError;
          return (
            <motion.div
              key={key}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_oklab,var(--fg)_3%,transparent)] px-3 py-2.5"
              initial={false}
              animate={{
                borderColor: active
                  ? "color-mix(in oklab, var(--accent) 45%, var(--border))"
                  : "var(--border)",
                boxShadow: active
                  ? "0 0 0 1px color-mix(in oklab, var(--accent) 25%, transparent)"
                  : "none",
              }}
              transition={{ duration: 0.3 }}
            >
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${
                  done
                    ? "bg-[color-mix(in_oklab,var(--success)_20%,transparent)] text-[var(--success)]"
                    : active
                      ? "bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--accent)]"
                      : "bg-[color-mix(in_oklab,var(--fg)_6%,transparent)] text-[var(--fg-muted)]"
                }`}
              >
                {done ? <Check size={18} /> : <Icon size={18} />}
              </div>
              <div className="min-w-0 text-left text-sm">
                <p className="font-medium text-[var(--fg)]">
                  {t(`pages.nodes.registerStep.${key}.title`)}
                </p>
                <p className="text-[11px] text-[var(--fg-muted)]">
                  {t(`pages.nodes.registerStep.${key}.desc`)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
