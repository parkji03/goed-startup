#!/usr/bin/env python3
"""
Diff messages/en.json against messages/es.json, translate the new/changed
English values via DeepL, and write them back into es.json. Wraps ICU
placeholders ({var}, {count, plural, ...}) with <x>...</x> + ignore_tags so
DeepL doesn't translate the placeholder syntax.

Required env: DEEPL_API_KEY
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EN_PATH = ROOT / "messages" / "en.json"
ES_PATH = ROOT / "messages" / "es.json"

DEEPL_URL = "https://api-free.deepl.com/v2/translate"
API_KEY = os.environ.get("DEEPL_API_KEY")
if not API_KEY:
    print("DEEPL_API_KEY not set", file=sys.stderr)
    sys.exit(1)


def flatten(obj, prefix=""):
    """Yield ('a.b.c', value) leaves of a nested dict."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else k)
    else:
        yield prefix, obj


def set_path(obj, path, value):
    keys = path.split(".")
    cur = obj
    for k in keys[:-1]:
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    cur[keys[-1]] = value


# Match top-level ICU placeholders like {name}, {count, plural, one {# x} other {# y}}
# We protect the entire balanced-brace block so DeepL doesn't translate inner ICU keywords.
# XML-escape characters outside ignore tags so DeepL's xml tag_handling parser doesn't
# choke on `&`, `<`, `>` in plain prose.
def wrap_icu(text):
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "{":
            depth = 1
            j = i + 1
            while j < n and depth > 0:
                if text[j] == "{":
                    depth += 1
                elif text[j] == "}":
                    depth -= 1
                j += 1
            block = text[i:j]  # placeholder content kept verbatim inside <x>
            out.append(f"<x>{block}</x>")
            i = j
        else:
            if ch == "&":
                out.append("&amp;")
            elif ch == "<":
                out.append("&lt;")
            elif ch == ">":
                out.append("&gt;")
            else:
                out.append(ch)
            i += 1
    return "".join(out)


def unwrap_icu(text):
    text = text.replace("<x>", "").replace("</x>", "")
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    return text


def translate_batch(texts, target_lang="ES"):
    """Send up to ~50 strings per call (DeepL accepts up to 50 text params)."""
    if not texts:
        return []
    payload = {
        "text": [wrap_icu(t) for t in texts],
        "target_lang": target_lang,
        "tag_handling": "xml",
        "ignore_tags": ["x"],
        "preserve_formatting": True,
    }
    req = urllib.request.Request(
        DEEPL_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"DeepL-Auth-Key {API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTPError {e.code}: {err_body}", file=sys.stderr)
        print(f"Offending texts ({len(texts)}):", file=sys.stderr)
        for i, t in enumerate(texts):
            print(f"  [{i}] {t!r}", file=sys.stderr)
        raise
    data = json.loads(body)
    return [unwrap_icu(t["text"]) for t in data["translations"]]


def main():
    en = json.loads(EN_PATH.read_text())
    es = json.loads(ES_PATH.read_text())

    en_flat = dict(flatten(en))
    es_flat = dict(flatten(es))

    # Identify keys that are missing in es OR whose en value differs from
    # whatever placeholder es has (e.g. when es still holds an English copy).
    to_translate = []
    for path, en_val in en_flat.items():
        if not isinstance(en_val, str):
            continue
        es_val = es_flat.get(path)
        if es_val is None:
            to_translate.append(path)
        # If es value is identical to en, also retranslate (handles English placeholders)
        elif es_val == en_val and not _looks_like_keep_as_is(en_val):
            to_translate.append(path)

    if not to_translate:
        print("No new keys to translate.")
        return

    print(f"Translating {len(to_translate)} keys ({sum(len(en_flat[p]) for p in to_translate)} chars)...")

    # Translate in batches of 25 to stay safely under DeepL's 50-text /
    # 30 KB body limits. Persist after every batch so partial progress
    # survives a transient failure.
    BATCH = 25
    translations = {}
    try:
        for i in range(0, len(to_translate), BATCH):
            batch_paths = to_translate[i : i + BATCH]
            batch_texts = [en_flat[p] for p in batch_paths]
            results = translate_batch(batch_texts)
            for p, t in zip(batch_paths, results):
                translations[p] = t
                print(f"  {p}\n    EN: {en_flat[p]!r}\n    ES: {t!r}")
            # Persist after each successful batch
            for path, val in translations.items():
                set_path(es, path, val)
            ES_PATH.write_text(json.dumps(es, indent=2, ensure_ascii=False) + "\n")
    finally:
        print(f"\nWrote {len(translations)} translations to {ES_PATH}")


def _looks_like_keep_as_is(s: str) -> bool:
    """Skip strings that should remain identical (proper nouns, codes, etc.)."""
    # Pure number ranges, codes
    if re.fullmatch(r"[0-9K\-–\s\$\+]+", s):
        return True
    # ALL CAPS short codes (e.g. "VC", "FinTech" wouldn't match this)
    if re.fullmatch(r"[A-Z]{1,4}", s):
        return True
    return False


if __name__ == "__main__":
    main()
