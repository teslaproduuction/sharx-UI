import { redirect } from "next/navigation";
import { p } from "@/lib/paths";
import { DEFAULT_SETTINGS_TAB } from "@/lib/settingsTabs";

export default function Page() {
  redirect(p(`panel/settings/${DEFAULT_SETTINGS_TAB}`));
}
