/**
 * Fills missing translation keys in web/translation/*.toml from translate.en_US.toml.
 * Existing strings in each locale are never overwritten — only absent keys get English text.
 *
 * Usage: node scripts/sync-toml-from-en.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transDir = path.join(__dirname, "../../web/translation");

const localeFiles = [
  "translate.ru_RU.toml",
  "translate.fa_IR.toml",
  "translate.zh_CN.toml",
  "translate.zh_TW.toml",
  "translate.ar_EG.toml",
  "translate.es_ES.toml",
  "translate.ja_JP.toml",
  "translate.id_ID.toml",
  "translate.tr_TR.toml",
  "translate.pt_BR.toml",
  "translate.uk_UA.toml",
  "translate.vi_VN.toml",
];

/**
 * @param {Record<string, unknown>} loc
 * @param {Record<string, unknown>} en
 */
function mergeMissing(loc, en) {
  /** @type {Record<string, unknown>} */
  const out = { ...loc };
  for (const [k, v] of Object.entries(en)) {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const existing = out[k];
      const existingObj =
        existing !== null &&
        typeof existing === "object" &&
        !Array.isArray(existing)
          ? /** @type {Record<string, unknown>} */ (existing)
          : {};
      out[k] = mergeMissing(existingObj, /** @type {Record<string, unknown>} */ (v));
    } else {
      if (!(k in out)) out[k] = v;
    }
  }
  return out;
}

const enPath = path.join(transDir, "translate.en_US.toml");
const enRaw = fs.readFileSync(enPath, "utf8");
const enTree = TOML.parse(enRaw);

for (const file of localeFiles) {
  const p = path.join(transDir, file);
  if (!fs.existsSync(p)) {
    console.warn("skip (missing):", file);
    continue;
  }
  const locTree = TOML.parse(fs.readFileSync(p, "utf8"));
  const merged = mergeMissing(
    /** @type {Record<string, unknown>} */ (locTree),
    /** @type {Record<string, unknown>} */ (enTree),
  );
  fs.writeFileSync(p, `${TOML.stringify(merged)}\n`, "utf8");
  console.log("updated", file);
}
