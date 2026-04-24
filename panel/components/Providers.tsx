"use client";

import { I18nProvider } from "./I18nProvider";
import { ToastProvider } from "./ui/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
