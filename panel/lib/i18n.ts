import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { p } from "./paths";

const STORAGE_KEY = "sharx:lang";

/** Must match `web/locale` `LocalizerMiddleware` cookie `lang` so API `msg` uses the same language as the panel. */
const SERVER_LANG_COOKIE = "lang";
const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400; // ~400 days, session-long preference

/**
 * BCP-47-style tags for go-i18n (matches embed `translate.*.toml` locales).
 * Short panel codes in `supported` are mapped to what the server localizer can resolve.
 */
function serverLangFromPanelCode(code: string): string {
  const map: Record<string, string> = {
    en: "en-US",
    ru: "ru-RU",
    fa: "fa-IR",
    zh: "zh-CN",
    tw: "zh-TW",
    ar: "ar-EG",
    es: "es-ES",
    ja: "ja-JP",
    id: "id-ID",
    tr: "tr-TR",
    pt: "pt-BR",
    uk: "uk-UA",
    vi: "vi-VN",
  };
  return map[code] ?? "en-US";
}

/** Keeps the Gin `lang` cookie in sync with panel UI; API responses use I18nWeb() with this localizer. */
function syncServerLocaleCookie(panelCode: string) {
  if (typeof document === "undefined") return;
  const tag = serverLangFromPanelCode(panelCode);
  const val = encodeURIComponent(tag);
  document.cookie = `${SERVER_LANG_COOKIE}=${val}; path=/; max-age=${COOKIE_MAX_AGE_SEC}; SameSite=Lax`;
}

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

function getInitialLang() {
  if (typeof window === "undefined") return "en";
  return localStorage.getItem(STORAGE_KEY) || "en";
}

export function setStoredLang(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, code);
  syncServerLocaleCookie(code);
}

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n() {
  if (i18n.isInitialized) return Promise.resolve(i18n);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lang = getInitialLang();
    syncServerLocaleCookie(lang);
    const tr = await loadBundle(lang);
    await i18n.use(initReactI18next).init({
      lng: lang,
      fallbackLng: "en",
      keySeparator: false,
      resources: { [lang]: { translation: tr } },
      interpolation: { escapeValue: false },
    });
    return i18n;
  })();
  return initPromise;
}

export async function changeLanguage(code: string) {
  setStoredLang(code);
  const tr = await loadBundle(code);
  i18n.addResourceBundle(code, "translation", tr, true, true);
  await i18n.changeLanguage(code);
}

export { i18n };
