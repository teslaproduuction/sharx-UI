#!/usr/bin/env python3
"""
Merge panel_missing_i18n_*.json (flat dotted keys) into web/translation TOML via
deep-merge, then regenerate panel/public/locales/*.json (same rules as gen-locales.mjs).

Requires: Python 3.11+, `tomli_w` (e.g. panel/.venv-merge: pip install tomli_w).

Safe to re-run: overwrites patch keys with JSON values only.

Usage:
  /path/to/panel/.venv-merge/bin/python sharx-code/panel/scripts/merge_panel_missing_i18n.py
"""
from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

try:
    import tomllib  # Python 3.11+
except ImportError as e:  # pragma: no cover
    raise SystemExit(f"tomllib required: {e}") from e

try:
    import tomli_w  # type: ignore[import-untyped]
except ImportError:
    raise SystemExit(
        "tomli_w is required. Example:\n"
        "  cd sharx-code/panel && python3 -m venv .venv-merge && "
        ".venv-merge/bin/pip install tomli-w && "
        ".venv-merge/bin/python scripts/merge_panel_missing_i18n.py\n"
    )

SCRIPT_DIR = Path(__file__).resolve().parent
TRANS_DIR = SCRIPT_DIR.parent.parent / "web" / "translation"
PANEL_DIR = SCRIPT_DIR.parent
LOCALES_OUT = PANEL_DIR / "public" / "locales"
EN_PATCH_PATH = SCRIPT_DIR / "panel_missing_i18n_en.json"
RU_PATCH_PATH = SCRIPT_DIR / "panel_missing_i18n_ru.json"

PLURAL_SUFFIXES = frozenset({"zero", "one", "two", "few", "many", "other"})
GO_PLACEHOLDER = re.compile(r"\{\{\.(\w+)\}\}")


def go_to_i18next_params(s: str) -> str:
    return GO_PLACEHOLDER.sub(lambda m: "{{" + m.group(1).lower() + "}}", str(s))


def to_i18next_key_value(flat_key: str, raw_value: str | int | float | bool):
    raw_s = raw_value if isinstance(raw_value, str) else str(raw_value)
    value = go_to_i18next_params(raw_s)
    dot = flat_key.rfind(".")
    if dot != -1:
        suffix = flat_key[dot + 1 :]
        if suffix in PLURAL_SUFFIXES:
            base = flat_key[:dot]
            return f"{base}_{suffix}", value
    return flat_key, value


def flatten_nested(obj: dict, prefix: str = "", acc: dict[str, str] | None = None) -> dict[str, str]:
    if acc is None:
        acc = {}
    for k, v in obj.items():
        key = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            flatten_nested(v, key, acc)
        else:
            ik, iv = to_i18next_key_value(key, v)
            acc[ik] = iv
    return acc


def dotted_set(root: dict, dotted_key: str, value: str) -> None:
    parts = dotted_key.split(".")
    cur = root
    for p in parts[:-1]:
        nxt = cur.get(p)
        if not isinstance(nxt, dict):
            nxt = {}
            cur[p] = nxt
        cur = nxt
    cur[parts[-1]] = value


def apply_flat_patch(tree: dict, patch: dict[str, str]) -> dict:
    out = copy.deepcopy(tree)
    for k, v in patch.items():
        dotted_set(out, k, v)
    return out


def load_toml(path: Path) -> dict:
    return tomllib.loads(path.read_text(encoding="utf-8"))


def save_toml(path: Path, data: dict) -> None:
    # multiline preserves readability for long hints; translators use unicode
    path.write_text(tomli_w.dumps(data), encoding="utf-8")


def write_locale_json(lang: str, flat: dict[str, str]) -> None:
    LOCALES_OUT.mkdir(parents=True, exist_ok=True)
    outp = LOCALES_OUT / f"{lang}.json"
    outp.write_text(json.dumps(flat, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def regen_locales_python() -> None:
    extend = sorted(
        {
            "en",
            "ru",
            "fa",
            "zh",
            "ar",
            "es",
            "ja",
            "id",
            "tr",
            "pt",
            "uk",
            "vi",
            "tw",
        }
    )
    file_by_lang = {
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
    }
    en_path = TRANS_DIR / file_by_lang["en"]
    en_flat = flatten_nested(load_toml(en_path))
    for lang in extend:
        fn = file_by_lang.get(lang)
        if not fn:
            continue
        p = TRANS_DIR / fn
        if not p.exists():
            print("skip missing", p, file=sys.stderr)
            continue
        flat = flatten_nested(load_toml(p))
        if lang != "en":
            for k, v in en_flat.items():
                flat.setdefault(k, v)
        write_locale_json(lang, flat)
        print("wrote", lang, len(flat))


def main() -> None:
    en_patch = json.loads(EN_PATCH_PATH.read_text(encoding="utf-8"))
    ru_patch = json.loads(RU_PATCH_PATH.read_text(encoding="utf-8"))
    if set(en_patch) != set(ru_patch):
        raise SystemExit(f"RU/EN patch key mismatch: {len(en_patch)} vs {len(ru_patch)}")
    pairs = (
        ("translate.en_US.toml", en_patch),
        ("translate.ru_RU.toml", ru_patch),
    )
    for fname, patch in pairs:
        path = TRANS_DIR / fname
        merged = apply_flat_patch(load_toml(path), patch)
        save_toml(path, merged)
        print("merged", path, "+", len(patch), "keys")
    regen_locales_python()


if __name__ == "__main__":
    main()
