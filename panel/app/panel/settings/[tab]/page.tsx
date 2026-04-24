import { notFound } from "next/navigation";
import { SettingsPage } from "@/components/SettingsPage";
import { isSettingsTabId, SETTINGS_TAB_IDS } from "@/lib/settingsTabs";

type PageProps = {
  params: Promise<{ tab: string }>;
};

export function generateStaticParams() {
  return SETTINGS_TAB_IDS.map((tab) => ({ tab }));
}

export default async function Page({ params }: PageProps) {
  const { tab } = await params;
  if (!isSettingsTabId(tab)) notFound();
  return <SettingsPage />;
}
