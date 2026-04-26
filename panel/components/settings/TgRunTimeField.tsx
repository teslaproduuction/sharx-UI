"use client";

import type { TFunction } from "i18next";
import { useMemo } from "react";
import { buildTgRunTime, type TgRunTimeMode, parseTgRunTime } from "@/lib/tgRunTime";
import { Input, SelectNative } from "@/components/ui";

type TgRunTimeFieldProps = {
  value: string;
  onChange: (v: string) => void;
  t: TFunction;
};

const MODE_SELECT_ORDER: TgRunTimeMode[] = [
  "hourly",
  "every6h",
  "every12h",
  "daily",
  "weekly",
  "monthly",
  "dailyAt",
  "custom",
];

const MODE_I18N: Record<TgRunTimeMode, string> = {
  hourly: "pages.settings.tgRunTimeOptionHourly",
  every6h: "pages.settings.tgRunTimeOptionEvery6h",
  every12h: "pages.settings.tgRunTimeOptionEvery12h",
  daily: "pages.settings.tgRunTimeOptionDaily",
  weekly: "pages.settings.tgRunTimeOptionWeekly",
  monthly: "pages.settings.tgRunTimeOptionMonthly",
  dailyAt: "pages.settings.tgRunTimeOptionDailyAt",
  custom: "pages.settings.tgRunTimeOptionCustom",
};

export function TgRunTimeField({ value, onChange, t }: TgRunTimeFieldProps) {
  const parsed = useMemo(() => parseTgRunTime(value), [value]);
  const mode = parsed.mode;
  const selectValue = mode;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <SelectNative
        value={selectValue}
        onChange={(e) => {
          const next = e.target.value as TgRunTimeMode;
          onChange(
            buildTgRunTime(
              next,
              value,
              next === "dailyAt" ? parsed.hour : 8,
              next === "dailyAt" ? parsed.minute : 0
            )
          );
        }}
        aria-label={t("pages.settings.telegramNotifyTime")}
      >
        {MODE_SELECT_ORDER.map((m) => (
          <option key={m} value={m}>
            {t(MODE_I18N[m])}
          </option>
        ))}
      </SelectNative>

      {mode === "dailyAt" ? (
        <div className="flex min-w-0 flex-wrap items-end gap-2 sm:flex-nowrap">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-xs text-[var(--fg-muted)]">{t("pages.settings.tgRunTimeHour")}</div>
            <Input
              type="number"
              min={0}
              max={23}
              value={parsed.hour}
              onChange={(e) => {
                const h = parseInt(e.target.value, 10);
                onChange(
                  buildTgRunTime(
                    "dailyAt",
                    value,
                    Number.isNaN(h) ? 0 : h,
                    parsed.minute
                  )
                );
              }}
              className="min-w-0"
              aria-label={t("pages.settings.tgRunTimeHour")}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-xs text-[var(--fg-muted)]">
              {t("pages.settings.tgRunTimeMinute")}
            </div>
            <Input
              type="number"
              min={0}
              max={59}
              value={parsed.minute}
              onChange={(e) => {
                const m = parseInt(e.target.value, 10);
                onChange(
                  buildTgRunTime(
                    "dailyAt",
                    value,
                    parsed.hour,
                    Number.isNaN(m) ? 0 : m
                  )
                );
              }}
              className="min-w-0"
              aria-label={t("pages.settings.tgRunTimeMinute")}
            />
          </div>
        </div>
      ) : null}

      {mode === "custom" ? (
        <div className="flex w-full min-w-0 flex-col gap-1">
          <div className="text-xs text-[var(--fg-muted)]">
            {t("pages.settings.tgRunTimeCustomHint")}
          </div>
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("pages.settings.tgRunTimeOptionCustom")}
          />
        </div>
      ) : null}
    </div>
  );
}
