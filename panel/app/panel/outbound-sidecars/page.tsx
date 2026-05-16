"use client";

import { Network } from "lucide-react";
import { SimpleListPage } from "@/components/SimpleListPage";

// Phase 3 — sing-box client outbounds (cascade members). Read-only list view
// for the first iteration; full CRUD modal lands once the backend Apply path
// settles (sing-box runtime panic on AnyTLS client outbound startup is the
// blocker — see .agent/scratch/overnight-test-results.md).
export default function Page() {
  return (
    <SimpleListPage
      titleKey="menu.outboundSidecars"
      path="outbound-sidecar/list"
      headerIcon={Network}
      headerIconTone="info"
    />
  );
}
