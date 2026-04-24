import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { p } from "./paths";

const STORAGE_KEY = "sharx:lang";

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
}

let initPromise: Promise<typeof i18n> | null = null;

export function initI18n() {
  if (i18n.isInitialized) return Promise.resolve(i18n);
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const lang = getInitialLang();
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
