/**
 * Flattens TOML translation files from web/translation to public/locales JSON for the panel.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transDir = path.join(__dirname, "../../web/translation");
const outDir = path.join(__dirname, "../public/locales");

const files = {
  "en": "translate.en_US.toml",
  "ru": "translate.ru_RU.toml",
  "fa": "translate.fa_IR.toml",
  "zh": "translate.zh_CN.toml",
  "ar": "translate.ar_EG.toml",
  "es": "translate.es_ES.toml",
  "ja": "translate.ja_JP.toml",
  "id": "translate.id_ID.toml",
  "tr": "translate.tr_TR.toml",
  "pt": "translate.pt_BR.toml",
  "uk": "translate.uk_UA.toml",
  "vi": "translate.vi_VN.toml",
  "tw": "translate.zh_TW.toml",
};

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

fs.mkdirSync(outDir, { recursive: true });

const enPath = path.join(transDir, files.en);
let enFlat = {};
if (fs.existsSync(enPath)) {
  enFlat = flatten(TOML.parse(fs.readFileSync(enPath, "utf8")));
}

for (const [lang, file] of Object.entries(files)) {
  const p = path.join(transDir, file);
  if (!fs.existsSync(p)) {
    console.warn("skip", p);
    continue;
  }
  const raw = fs.readFileSync(p, "utf8");
  const data = TOML.parse(raw);
  const flat = flatten(data);
  if (lang !== "en" && Object.keys(enFlat).length > 0) {
    for (const [k, v] of Object.entries(enFlat)) {
      if (!(k in flat)) flat[k] = v;
    }
  }
  fs.writeFileSync(
    path.join(outDir, `${lang}.json`),
    JSON.stringify(flat, null, 0),
    "utf8"
  );
  console.log("wrote", lang, Object.keys(flat).length, "keys");
}
