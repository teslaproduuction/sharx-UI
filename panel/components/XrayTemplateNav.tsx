"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { partitionSectionKeys, type XrayNavGroupDef } from "@/lib/xrayTemplateNavConfig";

export type XrayTemplateNavId = "general" | "full" | string;

type Props = {
  navId: XrayTemplateNavId;
  onSelect: (id: XrayTemplateNavId) => void;
  sectionKeys: string[];
  sectionLabel: (key: string) => string;
  disabled?: boolean;
  /** When false, only «Entire template» stays clickable so the user can fix JSON. */
  templateOk: boolean;
};

function NavButton({
  active,
  disabled: dis,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dis}
      aria-current={active ? "page" : undefined}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors lg:w-auto ${
        active
          ? "bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
      } ${dis ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function GroupHeading({ def, t }: { def: XrayNavGroupDef; t: (k: string) => string }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)] first:pt-0 lg:first:pt-0">
      {t(def.titleKey)}
    </div>
  );
}

export function XrayTemplateNav({
  navId,
  onSelect,
  sectionKeys,
  sectionLabel,
  disabled = false,
  templateOk,
}: Props) {
  const { t } = useTranslation();
  const { grouped, otherKeys } = partitionSectionKeys(sectionKeys);

  return (
    <nav
      aria-label={t("pages.xray.navAria", { defaultValue: "Xray template sections" })}
      className="flex min-w-0 flex-row gap-1 overflow-x-auto pb-1 lg:w-60 lg:shrink-0 lg:flex-col lg:gap-0 lg:overflow-x-visible lg:pb-0 lg:pr-2"
    >
      <div className="flex shrink-0 flex-row gap-1 lg:flex-col lg:gap-0">
        <NavButton
          active={navId === "general"}
          disabled={disabled || !templateOk}
          onClick={() => onSelect("general")}
        >
          {t("pages.xray.navGeneral", { defaultValue: "General" })}
        </NavButton>
      </div>

      {grouped.map(({ group, keys }) => {
        if (keys.length === 0) return null;
        return (
          <div key={group.id} className="flex shrink-0 flex-col lg:w-full">
            <GroupHeading def={group} t={t} />
            <div className="flex flex-row gap-1 lg:flex-col lg:gap-0">
              {keys.map((k) => (
                <NavButton
                  key={k}
                  active={navId === k}
                  disabled={disabled || !templateOk}
                  onClick={() => onSelect(k)}
                >
                  {sectionLabel(k)}
                </NavButton>
              ))}
            </div>
          </div>
        );
      })}

      {otherKeys.length > 0 ? (
        <div className="flex shrink-0 flex-col lg:w-full">
          <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-subtle)] lg:pt-3">
            {t("pages.xray.navGroup.misc", { defaultValue: "Other" })}
          </div>
          <div className="flex flex-row gap-1 lg:flex-col lg:gap-0">
            {otherKeys.map((k) => (
              <NavButton
                key={k}
                active={navId === k}
                disabled={disabled || !templateOk}
                onClick={() => onSelect(k)}
              >
                {sectionLabel(k)}
              </NavButton>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-1 flex shrink-0 flex-row gap-1 border-t border-[var(--border)] pt-2 lg:mt-2 lg:flex-col lg:gap-0 lg:border-t lg:pt-2">
        <NavButton
          active={navId === "full"}
          disabled={disabled}
          onClick={() => onSelect("full")}
        >
          {t("pages.xray.navFullTemplate", { defaultValue: "Entire template (JSON)" })}
        </NavButton>
      </div>
    </nav>
  );
}
