import { PanelLayoutGate } from "@/components/panel";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PanelLayoutGate>{children}</PanelLayoutGate>;
}
