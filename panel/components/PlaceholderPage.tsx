"use client";

import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { IconTile } from "@/components/ui";

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <PageScaffold>
      <PageHeader title={t(titleKey as never)} icon={Info} iconTone="info" />
      <Surface className="text-center" padding="lg">
        <div className="mx-auto flex max-w-md flex-col items-center gap-4">
          <IconTile icon={Info} tone="info" size="lg" />
          <p className="text-sm leading-relaxed text-[var(--fg-muted)]">
            This section is available in the panel shell. Connect UI flows to the same HTTP routes as the
            rest of the app when you extend this view.
          </p>
        </div>
      </Surface>
    </PageScaffold>
  );
}
