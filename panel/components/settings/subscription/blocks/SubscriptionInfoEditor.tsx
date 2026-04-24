"use client";

import { useTranslation } from "react-i18next";
import { Segmented } from "@/components/ui";
import type {
  BlockSubscriptionInfo,
  SubscriptionInfoVariant,
} from "@/lib/sharxSubpageConfig";
import { subscriptionInfoVariants } from "@/lib/sharxSubpageConfig";

type Props = {
  block: BlockSubscriptionInfo;
  onChange: (next: BlockSubscriptionInfo) => void;
};

export function SubscriptionInfoEditor({ block, onChange }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--fg-subtle)]">
          {t("subBuilder.block.variant", { defaultValue: "Variant" })}
        </div>
        <Segmented<SubscriptionInfoVariant>
          items={subscriptionInfoVariants.map((v) => ({
            id: v,
            label:
              v === "expanded"
                ? t("subBuilder.subInfo.expanded", { defaultValue: "Expanded" })
                : v === "compact"
                  ? t("subBuilder.subInfo.compact", { defaultValue: "Compact" })
                  : t("subBuilder.subInfo.cards", { defaultValue: "Cards" }),
          }))}
          value={block.variant}
          onChange={(variant) => onChange({ ...block, variant })}
          size="sm"
        />
      </div>
    </div>
  );
}
