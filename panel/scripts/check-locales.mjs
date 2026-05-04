/**
 * Checks locale completeness for the panel (JSON bundles) and for backend/go-i18n (TOML).
 *
 * Usage:
 *   node panel/scripts/check-locales.mjs
 *       Defaults: SPA bundles first (short); TOML as one-line summary per locale.
 *   node panel/scripts/check-locales.mjs --toml-verbose
 *       Also prints missing TOML key lists (can be very long).
 *   node panel/scripts/check-locales.mjs --panel-only
 *       Only JSON bundle parity vs en.json.
 *   node panel/scripts/check-locales.mjs --strict
 *       Exit 1 if any TOML locale lacks keys vs translate.en_US.toml.
 *   node panel/scripts/check-locales.mjs --strict-panel
 *       Exit 1 if panel/public/locales/*.json lacks keys vs en.json.
 *
 * Note: Incomplete TOML does not break the Next panel UI — gen-locales.mjs merges English
 * into non-en JSON. TOML gaps matter for Go/bot strings and translator backlog.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transDir = path.join(__dirname, "../../web/translation");
const publicLocalesDir = path.join(__dirname, "../public/locales");
const strict = process.argv.includes("--strict");
const strictPanel = process.argv.includes("--strict-panel");
const skipToml = process.argv.includes("--panel-only");
const tomlVerbose = process.argv.includes("--toml-verbose");

const locales = {
  ru: "translate.ru_RU.toml",
  fa: "translate.fa_IR.toml",
  zh: "translate.zh_CN.toml",
  tw: "translate.zh_TW.toml",
  ar: "translate.ar_EG.toml",
  es: "translate.es_ES.toml",
  ja: "translate.ja_JP.toml",
  id: "translate.id_ID.toml",
  tr: "translate.tr_TR.toml",
  pt: "translate.pt_BR.toml",
  uk: "translate.uk_UA.toml",
  vi: "translate.vi_VN.toml",
};

/** Same short codes as gen-locales.mjs → panel/public/locales/{code}.json */
const panelJsonFiles = {
  en: "en.json",
  ru: "ru.json",
  fa: "fa.json",
  zh: "zh.json",
  tw: "tw.json",
  ar: "ar.json",
  es: "es.json",
  ja: "ja.json",
  id: "id.json",
  tr: "tr.json",
  pt: "pt.json",
  uk: "uk.json",
  vi: "vi.json",
};

const PLURAL_SUFFIXES = new Set(["zero", "one", "two", "few", "many", "other"]);

function flatten(obj, prefix = "", acc = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, key, acc);
    } else {
      acc[key] = v;
    }
  }
  return acc;
}

function baseKey(key) {
  const dotIdx = key.lastIndexOf(".");
  if (dotIdx !== -1 && PLURAL_SUFFIXES.has(key.slice(dotIdx + 1))) {
    return key.slice(0, dotIdx);
  }
  return key;
}

let hasTomlMissing = false;
let hasPanelMissing = false;

/** @type {{ lang: string; missing: string[]; extra: number; coverage: string; file: string }[]} */
let tomlRows = [];
let totalTomlLogicalKeys = 0;

if (!skipToml) {
  const enPath = path.join(transDir, "translate.en_US.toml");
  if (!fs.existsSync(enPath)) {
    console.error("ERROR: English source file not found:", enPath);
    process.exit(1);
  }
  const enFlat = flatten(TOML.parse(fs.readFileSync(enPath, "utf8")));
  const enBaseKeys = new Set(Object.keys(enFlat).map(baseKey));
  totalTomlLogicalKeys = enBaseKeys.size;

  for (const [lang, file] of Object.entries(locales)) {
    const p = path.join(transDir, file);
    if (!fs.existsSync(p)) {
      tomlRows.push({ lang, missing: [], extra: -1, coverage: "SKIP", file });
      continue;
    }
    const flat = flatten(TOML.parse(fs.readFileSync(p, "utf8")));
    const langBaseKeys = new Set(Object.keys(flat).map(baseKey));
    const missing = [...enBaseKeys].filter((k) => !langBaseKeys.has(k));
    const extra = [...langBaseKeys].filter((k) => !enBaseKeys.has(k)).length;
    const coverage = (((totalTomlLogicalKeys - missing.length) / totalTomlLogicalKeys) * 100).toFixed(1);
    if (missing.length > 0) hasTomlMissing = true;
    tomlRows.push({ lang, missing, extra, coverage, file });
  }
}

// ─── 1. Panel SPA bundles (what matters for missing keys in the UI) ──────────

console.log(
  "\nPanel SPA — panel/public/locales/*.json vs en.json\n" +
    "(after gen-locales.mjs; every locale gets missing strings from English)\n",
);

const enJsonPath = path.join(publicLocalesDir, "en.json");
if (!fs.existsSync(enJsonPath)) {
  console.log("  SKIPPED — run `node scripts/gen-locales.mjs` first.\n");
} else {
  const enBundle = JSON.parse(fs.readFileSync(enJsonPath, "utf8"));
  const enKeys = Object.keys(enBundle);

  for (const [code, fname] of Object.entries(panelJsonFiles)) {
    const jpath = path.join(publicLocalesDir, fname);
    if (!fs.existsSync(jpath)) {
      console.warn(`  [${code}] SKIP — file not found: ${fname}`);
      hasPanelMissing = true;
      continue;
    }
    const bundle = JSON.parse(fs.readFileSync(jpath, "utf8"));
    const missingKeys = enKeys.filter((k) => !(k in bundle));
    const identicalToEn =
      code === "en"
        ? enKeys.length
        : enKeys.filter((k) => bundle[k] === enBundle[k]).length;

    if (missingKeys.length > 0) {
      hasPanelMissing = true;
      console.log(`  [${code}] MISSING — ${missingKeys.length} keys not in bundle (vs ${enKeys.length} in en.json)`);
      for (const k of missingKeys.slice(0, 15)) {
        console.log(`        - ${k}`);
      }
      if (missingKeys.length > 15) {
        console.log(`        ... and ${missingKeys.length - 15} more`);
      }
    } else {
      const note =
        code === "en" ? "reference" : `${identicalToEn}/${enKeys.length} strings identical to English (fallback or untranslated)`;
      console.log(`  [${code}] OK — ${enKeys.length} keys (${note})`);
    }
  }
  console.log();
}

// ─── 2. Backend / translator TOML backlog (compact unless --toml-verbose) ────

if (!skipToml) {
  console.log(
    "Backend & translators — web/translation/*.toml vs translate.en_US.toml\n" +
      `(logical keys in EN: ${totalTomlLogicalKeys}; gaps here do not strip keys from SPA JSON)\n`,
  );

  for (const row of tomlRows) {
    if (row.extra === -1) {
      console.warn(`  [${row.lang}] SKIP — file not found: ${row.file}`);
      continue;
    }
    const n = row.missing.length;
    const status = n === 0 ? "OK" : "behind EN";
    console.log(
      `  [${row.lang}] ${status} — ${row.coverage}% TOML (${n} missing, ${row.extra} extra keys vs EN)`,
    );
    if (tomlVerbose && n > 0) {
      for (const k of row.missing.slice(0, 20)) {
        console.log(`        - ${k}`);
      }
      if (n > 20) {
        console.log(`        ... and ${n - 20} more`);
      }
    }
  }
  if (!tomlVerbose && hasTomlMissing) {
    console.log("\n  Tip: run with --toml-verbose to list missing TOML keys.\n");
  } else {
    console.log();
  }
}

if (strict && hasTomlMissing) {
  console.error("Strict (--strict): incomplete TOML locale files vs English. Exiting with code 1.");
  process.exit(1);
}

if (strictPanel && hasPanelMissing) {
  console.error("Strict panel (--strict-panel): incomplete panel/public/locales bundles vs en.json. Exiting with code 1.");
  process.exit(1);
}
