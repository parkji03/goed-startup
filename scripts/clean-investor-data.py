#!/usr/bin/env python3
"""Clean up the investor-data CSV before seeding.

Two real defects observed in the LLM output (Bedrock/Haiku via Portkey):

1. XML-formatted object fields. For some rows, `differentiationClaim` (and
   occasionally `funding`) came back as a string starting with
   `<parameter name="claim">...</parameter>` instead of a JSON object. This
   happens when the model uses the XML-style tool-arg fallback inside what
   should be an object value.

2. Double-encoded JSON in array fields. `keyMetrics` and `notableCustomers`
   sometimes came back as a JSON-encoded *string* (e.g. `'[{...}]'`) rather
   than a native list, so the CSV cell contains the string repr instead of
   the parsed array.

Both will trip up Convex inserts and the UI. This script reads the dirty CSV,
normalizes those fields in place, and writes a cleaned CSV. Idempotent —
re-running on already-clean rows is a no-op.
"""
import argparse
import csv
import json
import re
import sys

INPUT_CSV = "Map Data for Builder Day - with-investor-data.csv"
OUTPUT_CSV = "Map Data for Builder Day - investor-data-clean.csv"

OBJECT_COLS = {"Differentiation Claim", "Funding"}
ARRAY_COLS = {"Founders", "Notable Customers", "Key Metrics", "Integrations", "Pages Crawled", "Hallucination Flags"}

# Enums must match convex/schema.ts. Out-of-vocabulary values get coerced
# to the nearest in-vocab equivalent (or cleared if no good match).
TARGET_MARKET_ENUM = {"enterprise", "mid-market", "smb", "consumer", "developer", "prosumer"}
TARGET_MARKET_COERCIONS = {"education": "smb"}  # K-12 / edu buyers behave like SMBs

MONETIZATION_ENUM = {"subscription", "usage-based", "marketplace", "transactional", "freemium", "contact-sales", "ads"}


def normalize_enum(raw: str, allowed: set, coercions: dict | None = None) -> tuple[str, str]:
    """Return (clean_value, fix_kind). Strips Bedrock XML cruft like
    'contact-sales</monetizationModel>\\n</invoke>' down to 'contact-sales'."""
    s = (raw or "").strip()
    if not s:
        return "", ""
    # Strip anything after the first XML/whitespace boundary if a known value sits at the start.
    candidate = re.split(r"[<\s]", s, maxsplit=1)[0].strip().lower()
    if candidate in allowed:
        return candidate, ("xml-cruft-stripped" if candidate != s else "")
    if coercions and candidate in coercions:
        return coercions[candidate], f"coerced:{candidate}→{coercions[candidate]}"
    return "", f"unknown-cleared:{candidate[:30]}"

XML_PARAM_RE = re.compile(r'<parameter\s+name="([^"]+)"\s*>(.*?)(?:</parameter>|$)', re.DOTALL)


def parse_xml_params(s: str) -> dict:
    """Salvage `<parameter name="x">value</parameter>` blocks into a dict."""
    out = {}
    for m in XML_PARAM_RE.finditer(s):
        out[m.group(1).strip()] = m.group(2).strip()
    return out


def looks_like_xml_args(s: str) -> bool:
    return "<parameter" in s[:200]


def is_placeholder_garbage(d: dict) -> bool:
    """Detect LLM placeholder output like {'round': '<UNKNOWN>', ...}."""
    if not d:
        return False
    for v in d.values():
        if isinstance(v, str) and v.strip() in ("<UNKNOWN>", "UNKNOWN", "<unknown>"):
            return True
    return False


def coerce_object(raw: str, col_name: str = "") -> tuple[dict | None, str]:
    """Return (parsed_dict, fix_kind). Empty input → (None, '')."""
    s = raw.strip()
    if not s:
        return None, ""

    # Pre-clean: replace literal `<UNKNOWN>` (without quotes) with `null` so the
    # cell parses as JSON instead of being treated as raw garbage.
    s_clean = re.sub(r":\s*<UNKNOWN>", ": null", s)

    try:
        parsed = json.loads(s_clean)
        if isinstance(parsed, dict):
            if is_placeholder_garbage(parsed):
                return None, "placeholder-cleared"
            # Drop fields whose value is literally "<UNKNOWN>"
            cleaned = {k: v for k, v in parsed.items()
                       if not (isinstance(v, str) and v.strip() in ("<UNKNOWN>", "UNKNOWN"))}
            return (cleaned if cleaned else None), ("placeholder-cleared" if not cleaned else "")
        if isinstance(parsed, str):
            return ({"claim": parsed} if parsed else None), "string-as-obj"
    except json.JSONDecodeError:
        pass

    # XML-formatted tool args
    if looks_like_xml_args(s):
        params = parse_xml_params(s)
        if params:
            return params, "xml-args"

    # Funding shouldn't fall back to {"claim": ...} — the schema differs.
    # For Differentiation Claim, salvaging unparseable text as the claim is fine.
    if col_name == "Differentiation Claim":
        return {"claim": s}, "raw-as-claim"
    return None, "unparseable-cleared"


def salvage_truncated_array(s: str) -> list | None:
    """Recover complete `{...}` objects from a truncated JSON array.

    LLMs that hit max_tokens leave a half-array like:
        '[{"a":1},{"b":2},{"c":'
    The first two objects are valid; the third is partial. Walk the string,
    track brace depth, and emit each object that closes cleanly.
    """
    if not s.lstrip().startswith("["):
        return None
    inside_str = False
    escape = False
    depth = 0
    start = -1
    items: list = []
    for i, ch in enumerate(s):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            inside_str = not inside_str
            continue
        if inside_str:
            continue
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    items.append(json.loads(s[start : i + 1]))
                except json.JSONDecodeError:
                    pass
                start = -1
    return items if items else None


def coerce_array(raw: str) -> tuple[list | None, str]:
    s = raw.strip()
    if not s:
        return None, ""

    try:
        parsed = json.loads(s)
    except json.JSONDecodeError:
        # Truncated JSON array (LLM hit max_tokens) — pull out the complete objects.
        salvaged = salvage_truncated_array(s)
        if salvaged:
            return salvaged, "truncated-salvaged"
        return None, "unrecoverable"

    # Double-encoded: parsed is a string that's itself JSON
    if isinstance(parsed, str):
        try:
            inner = json.loads(parsed)
            if isinstance(inner, list):
                return inner, "double-encoded"
        except json.JSONDecodeError:
            return None, "string-not-array"

    if isinstance(parsed, list):
        return parsed, ""
    return None, "unexpected-type"


def emit(v) -> str:
    """JSON-encode lists/dicts compactly; pass scalars through; None → ''."""
    if v is None:
        return ""
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=INPUT_CSV)
    parser.add_argument("--output", default=OUTPUT_CSV)
    args = parser.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames or []

    fixes: dict[str, int] = {}

    def tally(kind: str):
        if kind:
            fixes[kind] = fixes.get(kind, 0) + 1

    for r in rows:
        if "Target Market" in r:
            v, kind = normalize_enum(r["Target Market"], TARGET_MARKET_ENUM, TARGET_MARKET_COERCIONS)
            tally(f"Target Market: {kind}" if kind else "")
            r["Target Market"] = v
        if "Monetization Model" in r:
            v, kind = normalize_enum(r["Monetization Model"], MONETIZATION_ENUM)
            tally(f"Monetization Model: {kind}" if kind else "")
            r["Monetization Model"] = v

        for col in OBJECT_COLS:
            if col not in r:
                continue
            obj, kind = coerce_object(r[col], col_name=col)
            tally(f"{col}: {kind}" if kind else "")
            r[col] = emit(obj)

        for col in ARRAY_COLS:
            if col not in r:
                continue
            arr, kind = coerce_array(r[col])
            tally(f"{col}: {kind}" if kind else "")
            r[col] = emit(arr)

    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Cleaned {len(rows)} rows → {args.output}", file=sys.stderr)
    if fixes:
        print("\nFixes applied:", file=sys.stderr)
        for k, n in sorted(fixes.items(), key=lambda x: -x[1]):
            print(f"  {n:>3}× {k}", file=sys.stderr)


if __name__ == "__main__":
    main()
