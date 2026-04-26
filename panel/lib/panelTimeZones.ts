/** IANA zones for settings autocomplete; falls back if `Intl.supportedValuesOf` is unavailable. */
export function getPanelTimeZoneOptions(): string[] {
  try {
    const fn = (
      Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
    ).supportedValuesOf;
    if (typeof fn === "function") {
      const zones = fn.call(Intl, "timeZone");
      if (Array.isArray(zones) && zones.length > 0) {
        return ["Local", "UTC", ...zones];
      }
    }
  } catch {
    /* ignore */
  }
  return [
    "Local",
    "UTC",
    "Europe/Moscow",
    "Europe/London",
    "Asia/Dubai",
    "Asia/Tokyo",
    "America/New_York",
    "America/Los_Angeles",
  ];
}
