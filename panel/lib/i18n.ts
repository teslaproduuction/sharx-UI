import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getJson } from "./api";
import { p } from "./paths";
import { getUiPref, setUiPref } from "./uiPrefs";

/**
 * BCP-47-style tags for go-i18n (matches embed `translate.*.toml` locales).
 * Short panel codes in `supported` are mapped to what the server localizer can resolve.
 */
export const supported = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "fa", label: "فارسی" },
  { code: "zh", label: "简体中文" },
  { code: "tw", label: "繁體中文" },
  { code: "ar", label: "العربية" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
  { code: "id", label: "Indonesia" },
  { code: "tr", label: "Türkçe" },
  { code: "pt", label: "Português" },
  { code: "uk", label: "Українська" },
  { code: "vi", label: "Tiếng Việt" },
] as const;

function localeUrl(lang: string) {
  const u = p(`locales/${lang}.json`);
  if (typeof window === "undefined") {
    return `http://local.invalid${u}`;
  }
  return u;
}

async function loadBundle(lang: string) {
  const r = await fetch(localeUrl(lang), { cache: "no-store" });
  if (!r.ok) {
    const en = await fetch(localeUrl("en"), { cache: "no-store" });
    return (await en.json()) as Record<string, string>;
  }
  return (await r.json()) as Record<string, string>;
}

function isSupportedPanelCode(code: string | undefined | null): code is (typeof supported)[number]["code"] {
  return Boolean(code && supported.some((s) => s.code === code));
}

function normalizeLanguageTagToPanelCode(tag: string | null | undefined): (typeof supported)[number]["code"] | null {
  const raw = String(tag || "").trim().toLowerCase();
  if (!raw) return null;
  const map: Record<string, (typeof supported)[number]["code"]> = {
    "en-us": "en",
    "ru-ru": "ru",
    "fa-ir": "fa",
    "zh-cn": "zh",
    "zh-tw": "tw",
    "ar-eg": "ar",
    "es-es": "es",
    "ja-jp": "ja",
    "id-id": "id",
    "tr-tr": "tr",
    "pt-br": "pt",
    "uk-ua": "uk",
    "vi-vn": "vi",
  };
  if (map[raw]) return map[raw];
  if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk")) return "tw";
  if (raw.startsWith("zh")) return "zh";
  const primary = raw.split(/[-_]/)[0] || "";
  if (isSupportedPanelCode(primary)) return primary;
  return null;
}

async function getInitialLang(): Promise<(typeof supported)[number]["code"]> {
  if (typeof window === "undefined") return "en";
  try {
    const r = await getJson<{ panelLang?: string }>(p("panel/api/public/appMeta"));
    const fromPublic = r.success ? r.obj?.panelLang : null;
    if (isSupportedPanelCode(fromPublic)) return fromPublic;
  } catch {
    /* ignore */
  }
  const fromDb = await getUiPref("panelLang");
  if (isSupportedPanelCode(fromDb)) return fromDb;
  const navLangs = Array.isArray(navigator.languages) ? navigator.languages : [];
  for (const candidate of navLangs) {
    const mapped = normalizeLanguageTagToPanelCode(candidate);
    if (mapped) return mapped;
  }
  const mappedSingle = normalizeLanguageTagToPanelCode(navigator.language);
  if (mappedSingle) return mappedSingle;
  return "en";
}

export function setStoredLang(code: string) {
  if (!isSupportedPanelCode(code)) return;
  void setUiPref("panelLang", code);
}

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n() {
  if (i18n.isInitialized) return Promise.resolve(i18n);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lang = await getInitialLang();
    const tr = await loadBundle(lang);
    await i18n.use(initReactI18next).init({
      lng: lang,
      fallbackLng: "en",
      keySeparator: false,
      resources: { [lang]: { translation: tr } },
      interpolation: { escapeValue: false },
      saveMissing: process.env.NODE_ENV === "development",
      missingKeyHandler: (lngs, _ns, key) => {
        console.warn(`[i18n] Missing key: "${key}" for lang "${lngs.join(", ")}"`);
      },
    });
    return i18n;
  })();
  return initPromise;
}

export async function changeLanguage(code: string) {
  if (!isSupportedPanelCode(code)) {
    return;
  }
  setStoredLang(code);
  const tr = await loadBundle(code);
  i18n.addResourceBundle(code, "translation", tr, true, true);
  await i18n.changeLanguage(code);
}

export function panelSelectLangValue(): string {
  const raw = (i18n.resolvedLanguage || i18n.language || "en").trim();
  if (!raw) return "en";
  if (supported.some((s) => s.code === raw)) {
    return raw;
  }
  const lower = raw.toLowerCase();
  if (lower === "tw" || lower.startsWith("zh-tw") || lower.startsWith("zh-hk")) {
    return "tw";
  }
  if (lower.startsWith("zh")) {
    return "zh";
  }
  const primary = lower.split(/[-_]/)[0] || "en";
  if (supported.some((s) => s.code === primary)) {
    return primary;
  }
  return "en";
}

export { i18n };
