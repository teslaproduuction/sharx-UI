"use client";

import { usePathname } from "next/navigation";
import { PanelShell } from "@/components/panel/PanelShell";

/** Uses full shell for most panel routes; minimal chrome for the public subscription page. */
export function PanelLayoutGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isPublicSub = pathname.includes("/panel/sub");
  if (isPublicSub) {
    return <div className="min-h-screen antialiased">{children}</div>;
  }
  return <PanelShell>{children}</PanelShell>;
}
