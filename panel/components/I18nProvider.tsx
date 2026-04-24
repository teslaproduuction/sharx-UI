"use client";

import { I18nextProvider } from "react-i18next";
import { useEffect, useState } from "react";
import { i18n, initI18n } from "@/lib/i18n";
import { Spinner } from "./ui/spinner";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    void initI18n().then(() => setOk(true));
  }, []);
  if (!ok) {
    return (
      <div className="grid min-h-dvh place-items-center" style={{ background: "var(--bg)" }}>
        <Spinner size={40} />
      </div>
    );
  }
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
