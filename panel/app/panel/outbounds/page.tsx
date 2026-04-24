"use client";

import { ArrowLeftRight } from "lucide-react";
import { SimpleListPage } from "@/components/SimpleListPage";

export default function Page() {
  return (
    <SimpleListPage
      titleKey="menu.outbounds"
      path="outbound/list"
      headerIcon={ArrowLeftRight}
      headerIconTone="info"
    />
  );
}
