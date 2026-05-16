"use client";

import { GitBranch } from "lucide-react";
import { SimpleListPage } from "@/components/SimpleListPage";

// Phase 4 — cascade chains. Read-only list view first; full member-multiselect
// + strategy editor lands once Phase 5 UI polish round happens.
export default function Page() {
  return (
    <SimpleListPage
      titleKey="menu.outboundChains"
      path="outbound-chain/list"
      headerIcon={GitBranch}
      headerIconTone="info"
    />
  );
}
