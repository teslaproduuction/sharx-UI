"use client";

import { useTranslation } from "react-i18next";
import { SubPageRenderer } from "@/components/sub/SubPageRenderer";
import { SubPageShell } from "@/components/sub/SubPageShell";
import { MOCK_SUB_DATA, type PublicSubPayload } from "@/components/sub/types";
import type { SharxSubpageConfigV2 } from "@/lib/sharxSubpageConfig";

type Props = {
  config: SharxSubpageConfigV2;
};

export function SubscriptionPreview({ config }: Props) {
  const { t } = useTranslation();

  const data: PublicSubPayload = { ...MOCK_SUB_DATA, config };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.preview.label", { defaultValue: "Live preview" })}
        </div>
        <span className="text-[11px] text-[var(--fg-subtle)]">
          {t("subBuilder.preview.desktopOnly", { defaultValue: "Desktop view" })}
        </span>
      </div>
      <div
        className="sub-preview-frame sub-preview-frame--desktop mx-auto w-full"
        aria-label={t("subBuilder.preview.label", { defaultValue: "Live preview" })}
      >
        <div
          className="h-[720px] w-full overflow-y-auto overflow-x-hidden"
          style={{ scrollbarWidth: "thin" }}
        >
          <SubPageShell
            branding={config.branding}
            theme={config.theme}
            colorPreset={config.colorPreset}
          >
            <SubPageRenderer data={data} interactive={false} />
          </SubPageShell>
        </div>
      </div>
    </div>
  );
}
