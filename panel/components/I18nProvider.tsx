"use client";

import { I18nextProvider } from "react-i18next";
import { useEffect, useState } from "react";
import { i18n, initI18n } from "@/lib/i18n";

const I18N_BOOT_MIN_MS = 500;

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [splashFading, setSplashFading] = useState(false);
  const [splashGone, setSplashGone] = useState(false);

  useEffect(() => {
    void (async () => {
      await Promise.all([
        initI18n(),
        new Promise<void>((r) => setTimeout(r, I18N_BOOT_MIN_MS)),
      ]);
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    const id = requestAnimationFrame(() => setSplashFading(true));
    return () => cancelAnimationFrame(id);
  }, [ready]);

  useEffect(() => {
    if (!splashFading) return;
    const t = window.setTimeout(() => setSplashGone(true), 600);
    return () => window.clearTimeout(t);
  }, [splashFading]);

  return (
    <div className="relative min-h-dvh" style={{ background: "var(--bg)" }}>
      {ready ? (
        <I18nextProvider i18n={i18n}>
          {/*
            Do not use .route-fade here: its animation uses `transform` on the root,
            which makes `position: fixed` (panel sidebar, modals) use the wrong
            containing block and the menu can "disappear" on navigation/scroll.
          */}
          <div className="min-h-dvh">{children}</div>
        </I18nextProvider>
      ) : null}
      {!splashGone ? (
        <div
          className={`fixed inset-0 z-[100] bg-[var(--bg)] transition-opacity duration-500 ease-out ${
            splashFading ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
          aria-hidden
          onTransitionEnd={(e) => {
            if (e.propertyName === "opacity" && splashFading) {
              setSplashGone(true);
            }
          }}
        />
      ) : null}
    </div>
  );
}
