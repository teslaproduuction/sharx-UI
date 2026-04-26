export type TgRunTimeMode =
  | "hourly"
  | "every6h"
  | "every12h"
  | "daily"
  | "weekly"
  | "monthly"
  | "dailyAt"
  | "custom";

const PRESETS: Record<Exclude<TgRunTimeMode, "dailyAt" | "custom">, string> = {
  hourly: "@hourly",
  every6h: "@every 6h",
  every12h: "@every 12h",
  daily: "@daily",
  weekly: "@weekly",
  monthly: "@monthly",
};

function normalizeSpaces(s: string) {
  return s.trim().replace(/\s+/g, " ");
}

function matchPreset(expr: string): Exclude<TgRunTimeMode, "dailyAt" | "custom"> | null {
  const e = normalizeSpaces(expr).toLowerCase();
  for (const [mode, preset] of Object.entries(PRESETS) as [keyof typeof PRESETS, string][]) {
    if (e === preset.toLowerCase()) return mode;
  }
  return null;
}

export function parseTgRunTime(expr: string): {
  mode: TgRunTimeMode;
  hour: number;
  minute: number;
} {
  const raw = normalizeSpaces(expr);
  if (!raw) {
    return { mode: "daily", hour: 8, minute: 0 };
  }

  const preset = matchPreset(raw);
  if (preset) {
    return { mode: preset, hour: 8, minute: 0 };
  }

  // Six fields, daily at (second must be 0 for simple editor)
  const six = /^0 (\d{1,2}) (\d{1,2}) \* \* \*$/i.exec(raw);
  if (six) {
    return {
      mode: "dailyAt",
      minute: Math.min(59, Math.max(0, parseInt(six[1], 10))),
      hour: Math.min(23, Math.max(0, parseInt(six[2], 10))),
    };
  }

  // Any other 6-field schedule → custom
  if (/^(\S+\s+){5}\S+$/.test(raw)) {
    return { mode: "custom", hour: 8, minute: 0 };
  }

  // Five fields: minute hour * * *
  const five = /^(\d{1,2}) (\d{1,2}) \* \* \*$/i.exec(raw);
  if (five) {
    return {
      mode: "dailyAt",
      minute: Math.min(59, Math.max(0, parseInt(five[1], 10))),
      hour: Math.min(23, Math.max(0, parseInt(five[2], 10))),
    };
  }

  return { mode: "custom", hour: 8, minute: 0 };
}

export function buildTgRunTime(
  mode: TgRunTimeMode,
  customValue: string,
  hour: number,
  minute: number
): string {
  if (mode === "custom") {
    return normalizeSpaces(customValue);
  }
  if (mode === "dailyAt") {
    const h = Math.min(23, Math.max(0, Math.floor(hour)));
    const m = Math.min(59, Math.max(0, Math.floor(minute)));
    return `0 ${m} ${h} * * *`;
  }
  if (mode in PRESETS) {
    return PRESETS[mode as keyof typeof PRESETS];
  }
  return "@daily";
}
