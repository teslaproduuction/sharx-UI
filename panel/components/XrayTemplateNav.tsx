"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileJson,
  Globe,
  Layers,
  Search,
  Settings2,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui";
import {
  partitionSectionKeys,
  type XrayNavGroupDef,
  type XrayNavGroupId,
} from "@/lib/xrayTemplateNavConfig";

const GROUP_ICONS: Record<XrayNavGroupId, ReactNode> = {
  core: <Settings2 size={14} />,
  network: <Globe size={14} />,
  endpoints: <Layers size={14} />,
  advanced: <SlidersHorizontal size={14} />,
  other: <FileJson size={14} />,
};

const NAV_EXPAND_KEY = "sharx.xray.nav.expanded";

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
      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-left text-sm transition-colors lg:w-full lg:whitespace-normal ${
        active
          ? "bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
          : "text-[var(--fg-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--fg)]"
      } ${dis ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {children}
    </button>
  );
}

function GroupHeading({
  def,
  t,
  expanded,
  onToggle,
}: {
  def: XrayNavGroupDef;
  t: (k: string) => string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="hidden w-full items-center gap-1.5 px-2 pb-1 pt-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] first:pt-1 hover:text-[var(--fg)] lg:flex"
    >
      {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
      <span className="text-[var(--fg-muted)]">{GROUP_ICONS[def.id]}</span>
      {t(def.titleKey)}
    </button>
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
  const [query, setQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(NAV_EXPAND_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(NAV_EXPAND_KEY, JSON.stringify(expandedGroups));
    } catch {
      /* ignore */
    }
  }, [expandedGroups]);
  const q = query.trim().toLowerCase();
  const filteredKeys = useMemo(() => {
    if (!q) return sectionKeys;
    return sectionKeys.filter((k) => sectionLabel(k).toLowerCase().includes(q) || k.toLowerCase().includes(q));
  }, [sectionKeys, sectionLabel, q]);
  const { grouped, otherKeys } = partitionSectionKeys(filteredKeys);

  return (
    <nav
      aria-label={t("pages.xray.navAria", { defaultValue: "Xray template sections" })}
      className="flex min-w-0 flex-row gap-1 overflow-x-auto pb-1 lg:w-60 lg:shrink-0 lg:flex-col lg:gap-0 lg:overflow-x-visible lg:pb-0 lg:pr-2"
    >
      <div className="mb-2 hidden px-1 lg:block">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <Input
            className="!h-8 !pl-8 text-xs"
            placeholder={t("pages.xray.navSearch", { defaultValue: "Search sections…" })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>
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
        const expanded = q ? true : expandedGroups[group.id] !== false;
        return (
          <div key={group.id} className="flex shrink-0 flex-col lg:w-full">
            <GroupHeading
              def={group}
              t={t}
              expanded={expanded}
              onToggle={() =>
                setExpandedGroups((prev) => ({
                  ...prev,
                  [group.id]: prev[group.id] === false,
                }))
              }
            />
            {expanded ? (
              <div className="flex flex-row gap-1 lg:flex-col lg:gap-0 lg:pl-2">
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
            ) : null}
          </div>
        );
      })}

      {otherKeys.length > 0 ? (
        <div className="flex shrink-0 flex-col lg:w-full">
          <div className="hidden px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)] lg:block">
            {t("pages.xray.navGroup.misc", { defaultValue: "Other" })}
          </div>
          <div className="flex flex-row gap-1 lg:flex-col lg:gap-0 lg:pl-2">
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
