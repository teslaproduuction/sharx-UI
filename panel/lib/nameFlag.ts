/** Optional country/region flag emoji before a display name (remark / node name). */

const NAME_FLAG_SELECT_OPTIONS_RAW: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "🇺🇸", label: "🇺🇸 US" },
  { value: "🇬🇧", label: "🇬🇧 UK" },
  { value: "🇩🇪", label: "🇩🇪 DE" },
  { value: "🇳🇱", label: "🇳🇱 NL" },
  { value: "🇫🇷", label: "🇫🇷 FR" },
  { value: "🇨🇭", label: "🇨🇭 CH" },
  { value: "🇸🇪", label: "🇸🇪 SE" },
  { value: "🇳🇴", label: "🇳🇴 NO" },
  { value: "🇫🇮", label: "🇫🇮 FI" },
  { value: "🇵🇱", label: "🇵🇱 PL" },
  { value: "🇨🇦", label: "🇨🇦 CA" },
  { value: "🇸🇬", label: "🇸🇬 SG" },
  { value: "🇯🇵", label: "🇯🇵 JP" },
  { value: "🇰🇷", label: "🇰🇷 KR" },
  { value: "🇭🇰", label: "🇭🇰 HK" },
  { value: "🇦🇪", label: "🇦🇪 AE" },
  { value: "🇦🇺", label: "🇦🇺 AU" },
  { value: "🇧🇷", label: "🇧🇷 BR" },
  { value: "🇪🇸", label: "🇪🇸 ES" },
  { value: "🇮🇹", label: "🇮🇹 IT" },
  { value: "🇦🇹", label: "🇦🇹 AT" },
  { value: "🇷🇴", label: "🇷🇴 RO" },
  { value: "🇨🇿", label: "🇨🇿 CZ" },
  { value: "🇮🇱", label: "🇮🇱 IL" },
  { value: "🇮🇳", label: "🇮🇳 IN" },
  { value: "🇷🇺", label: "🇷🇺 RU" },
  { value: "🇺🇦", label: "🇺🇦 UA" },
  { value: "🇰🇿", label: "🇰🇿 KZ" },
  { value: "🇹🇷", label: "🇹🇷 TR" },
  { value: "🇦🇲", label: "🇦🇲 AM" },
  { value: "🇬🇪", label: "🇬🇪 GE" },
  { value: "🇦🇿", label: "🇦🇿 AZ" },
  { value: "🇪🇪", label: "🇪🇪 EE" },
  { value: "🇱🇹", label: "🇱🇹 LT" },
  { value: "🇱🇻", label: "🇱🇻 LV" },
  { value: "🇧🇬", label: "🇧🇬 BG" },
  { value: "🇬🇷", label: "🇬🇷 GR" },
  { value: "🇲🇩", label: "🇲🇩 MD" },
  { value: "🇲🇰", label: "🇲🇰 MK" },
  { value: "🇷🇸", label: "🇷🇸 RS" },
  { value: "🇽🇰", label: "🇽🇰 XK" },
  { value: "🇧🇦", label: "🇧🇦 BA" },
  { value: "🇲🇪", label: "🇲🇪 ME" },
  { value: "🇦🇱", label: "🇦🇱 AL" },
  { value: "🇦🇩", label: "🇦🇩 AD" },
  { value: "🇨🇳", label: "🇨🇳 CN" },
  { value: "🇲🇽", label: "🇲🇽 MX" },
  { value: "🇦🇷", label: "🇦🇷 AR" },
  { value: "🇨🇱", label: "🇨🇱 CL" },
  { value: "🇳🇬", label: "🇳🇬 NG" },
  { value: "🇿🇦", label: "🇿🇦 ZA" },
  { value: "🇪🇬", label: "🇪🇬 EG" },
];

export const NAME_FLAG_SELECT_OPTIONS: { value: string; label: string }[] = [
  NAME_FLAG_SELECT_OPTIONS_RAW[0],
  ...NAME_FLAG_SELECT_OPTIONS_RAW
    .slice(1)
    .sort((a, b) => a.label.localeCompare(b.label, "en")),
];

const KNOWN_FLAG_PREFIXES: string[] = [
  ...new Set(
    NAME_FLAG_SELECT_OPTIONS.map((o) => o.value).filter(Boolean) as string[],
  ),
].sort((a, b) => b.length - a.length);

/**
 * Splits a stored display string into known leading flag emoji and the rest.
 * Unknown leading symbols stay in `text`.
 */
export function splitNameFlag(remark: string): {
  flag: string;
  text: string;
} {
  const t = remark.trimStart();
  for (const f of KNOWN_FLAG_PREFIXES) {
    if (t.startsWith(f)) {
      return { flag: f, text: t.slice(f.length).trimStart() };
    }
  }
  return { flag: "", text: remark };
}

/** Persists as "flag name" (or `text` only if no flag). */
export function joinNameFlag(flag: string, text: string): string {
  const te = text.trim();
  if (!flag) return te;
  return te ? `${flag} ${te}` : flag;
}
