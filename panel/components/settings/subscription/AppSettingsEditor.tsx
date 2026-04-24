"use client";

import { Lock, RefreshCw, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IconTile, Switch } from "@/components/ui";
import type { IconTileTone } from "@/components/ui/icon-tile";
import {
  defaultAppSettings,
  type AppSettings,
  type SharxSubpageConfigV2,
} from "@/lib/sharxSubpageConfig";

type Props = {
  config: SharxSubpageConfigV2;
  onChange: (next: SharxSubpageConfigV2) => void;
};

type ToggleKey = keyof AppSettings;

type ToggleMeta = {
  key: ToggleKey;
  icon: LucideIcon;
  tone: IconTileTone;
  titleKey: string;
  titleDefault: string;
  descKey: string;
  descDefault: string;
};

type Group = {
  titleKey: string;
  titleDefault: string;
  toggles: ToggleMeta[];
};

const GROUPS: Group[] = [
  {
    titleKey: "subBuilder.appSettings.groups.encryption",
    titleDefault: "Encryption",
    toggles: [
      {
        key: "encrypt",
        icon: Lock,
        tone: "accent",
        titleKey: "subBuilder.appSettings.encrypt.title",
        titleDefault: "Encrypt base subscription",
        descKey: "subBuilder.appSettings.encrypt.desc",
        descDefault:
          "Require Happ/v2raytun/browser; everything else is blocked from the base endpoint.",
      },
    ],
  },
  {
    titleKey: "subBuilder.appSettings.groups.visibility",
    titleDefault: "Client visibility",
    toggles: [
      {
        key: "showInfo",
        icon: Smartphone,
        tone: "success",
        titleKey: "subBuilder.appSettings.showInfo.title",
        titleDefault: "Include traffic/expiry in remark",
        descKey: "subBuilder.appSettings.showInfo.desc",
        descDefault: "Append remaining traffic and expiry to each config name.",
      },
    ],
  },
];

export function AppSettingsEditor({ config, onChange }: Props) {
  const { t } = useTranslation();
  const settings: AppSettings = config.appSettings ?? defaultAppSettings();

  const set = (patch: Partial<AppSettings>) =>
    onChange({ ...config, appSettings: { ...settings, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <section key={group.titleKey} className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <RefreshCw
              size={14}
              className="hidden text-[var(--fg-subtle)] sm:block"
              aria-hidden
            />
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)]">
              {t(group.titleKey, { defaultValue: group.titleDefault })}
            </h4>
          </div>
          <ul className="flex flex-col gap-2">
            {group.toggles.map((item) => (
              <li
                key={item.key}
                className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
              >
                <IconTile icon={item.icon} tone={item.tone} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--fg)]">
                    {t(item.titleKey, { defaultValue: item.titleDefault })}
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--fg-subtle)]">
                    {t(item.descKey, { defaultValue: item.descDefault })}
                  </p>
                </div>
                <Switch
                  checked={!!settings[item.key]}
                  onChange={(next) => set({ [item.key]: next } as Partial<AppSettings>)}
                  ariaLabel={t(item.titleKey, { defaultValue: item.titleDefault })}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
