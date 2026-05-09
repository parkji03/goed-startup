#!/usr/bin/env python3
"""
Audit Tier-1 markdown files for metadata coverage against the resources schema:
  title, description, url, category, communities, industries, locations, stageTags, tags.

For each file:
  - body length (= raw narrative we can use for description/embedding)
  - external homepage URL (the actual program link, not the startup.utah.gov post)
  - inferred industries / communities / locations / stage cues (from keyword lookup)
  - signals that confirm it's a program (apply / deadline / eligibility / $ amounts)

Output is a JSON file plus a printed summary so we can review what's safe to import
unattended vs. what needs human/LLM tagging.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CONTENT_ROOT = ROOT / "startup-utah-content"
TIER1_DIRS = ["resources", "funding", "state-programs"]
OUT_PATH = ROOT / "scripts" / "out" / "tier1-audit.json"

# Vocabularies match the existing CSV — keep these in sync with data/resources-builder-day.csv.
COMMUNITIES = {
    "Rural": [r"\brural\b"],
    "Multicultural": [r"\bminority(?:-?owned)?\b", r"\bmulticultural\b", r"\b8\(a\)\b", r"\bdiversity\b", r"\bunderrepresented\b"],
    "Student": [r"\bstudent[s]?\b", r"\buniversity\b", r"\bcollege\b", r"\bphd\b", r"\bgraduate\b", r"\bcampus\b"],
    "Women": [r"\bwomen-?owned\b", r"\bwomen entrepreneur", r"\bfemale founder", r"\bwomen in (?:tech|business)\b"],
    "Veteran": [r"\bveteran[s]?\b", r"\bmilitary\b"],
    "New American": [r"\bnew american\b", r"\bimmigrant\b", r"\brefugee\b"],
}

INDUSTRIES = {
    "Aerospace and Defense": [r"\baerospace\b", r"\bdefense\b", r"\bmilitary\b", r"\bdrone\b"],
    "Agriculture": [r"\bagricult", r"\bfarm\b", r"\bfarmer", r"\bfarmers? market", r"\branch", r"\blivestock"],
    "Arts and Entertainment and Recreation": [r"\barts?\b", r"\bentertainment\b", r"\bcreative\b", r"\bmedia\b"],
    "Consumer Packaged Goods": [r"\bcpg\b", r"\bconsumer goods\b", r"\bretail\b", r"\bproduct goods\b"],
    "Financial Services": [r"\bfintech\b", r"\bfinancial services\b", r"\bbanking\b", r"\binsurance\b", r"\bcredit\b"],
    "Hospitality and Food Services": [r"\bhospitality\b", r"\brestaurant\b", r"\bfood service\b", r"\bhotel\b"],
    "Life Sciences and Healthcare": [
        r"\bbiotech\b", r"\bhealth ?care\b", r"\bhealthtech\b", r"\bpharma", r"\bclinical\b",
        r"\bbiomed\w*", r"\blife scien", r"\bdiagnostic\b", r"\bmedical (?:device|devices)\b", r"\bfda\b",
    ],
    "Manufacturing": [r"\bmanufactur", r"\bfabrication\b", r"\bproduction line\b", r"\bcnc\b", r"\bsupply chain\b"],
    "Software and Information Technology": [
        r"\bsoftware\b", r"\bsaas\b", r"\bb2b\b", r"\btech (?:start ?up|company|sector|hub)\b",
        r"\bartificial intelligence\b", r"\bai\b", r"\bcyber", r"\bcloud\b",
    ],
}

LOCATIONS = [
    "Salt Lake", "Davis", "Morgan", "Tooele", "Weber", "Washington", "Iron", "Beaver",
    "Garfield", "Kane", "Utah", "Wasatch", "Summit", "Carbon", "Emery", "Grand",
    "San Juan", "Sevier", "Juab", "Millard", "Sanpete", "Piute", "Box Elder", "Cache",
    "Daggett", "Duchesne", "Uintah", "Wayne", "Rich",
]

CITY_TO_COUNTY = {
    "salt lake city": "Salt Lake", "ogden": "Weber", "provo": "Utah", "lehi": "Utah",
    "orem": "Utah", "park city": "Summit", "st. george": "Washington", "saint george": "Washington",
    "logan": "Cache", "cedar city": "Iron", "vernal": "Uintah", "moab": "Grand",
}

STAGE_CUES = {
    "idea": [r"\bidea[s]?\b", r"\bpre-?idea\b", r"\bconcept\b", r"\bideation\b"],
    "validation": [r"\bvalidat", r"\bcustomer discovery\b", r"\bmarket research\b"],
    "early-stage": [r"\bearly[- ]stage\b", r"\bpre-?seed\b", r"\bseed\b"],
    "growth": [r"\bgrowth[- ]stage\b", r"\bscale\b", r"\bscaling\b", r"\blate[- ]stage\b"],
    "pre-revenue": [r"\bpre-?revenue\b"],
    "international": [r"\binternational\b", r"\bexport\b", r"\boverseas\b", r"\bglobal market"],
    "ip": [r"\bpatent\b", r"\btrademark\b", r"\bintellectual property\b"],
    "funded": [r"\bgrant\b", r"\bsbir\b", r"\bsttr\b", r"\bventure\b", r"\bangel\b", r"\bequity\b"],
}

PROGRAM_SIGNALS = {
    "apply": re.compile(r"\bappl(?:y|ication|ying)\b", re.I),
    "deadline": re.compile(r"\bdeadline\b|\bdue\b|\bopen until\b", re.I),
    "eligibility": re.compile(r"\beligib", re.I),
    "dollar_amount": re.compile(r"\$[0-9][0-9,.]*\s?(?:k|m|million|billion)?\b", re.I),
}

GUIDE_TITLE_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"\bfive ways\b", r"\bsix things\b", r"\bhow to\b", r"\bwhat to\b",
        r"\b(?:tips|strategies|guide)\b", r"^ready to\b", r"^bolstering ",
        r"^prepare your\b", r"^networking[: ]", r"^pitch competitions[: ]",
        r"^small business funding[: ]", r"^explore grants",
        r"^turning your passion", r"^crowdfunding[: ]",
    ]
]

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
LINK_RE = re.compile(r"\]\((https?://[^\s)]+)\)")


def host(u: str) -> str:
    h = urlparse(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def is_guide(title: str) -> bool:
    return any(p.search(title) for p in GUIDE_TITLE_PATTERNS)


def parse_md(p: Path, category: str):
    raw = p.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return None
    fm = m.group(1)
    title_m = re.search(r'^title:\s*"?(.+?)"?\s*$', fm, re.M)
    url_m = re.search(r"^url:\s*(\S+)\s*$", fm, re.M)
    if not title_m or not url_m:
        return None
    title = title_m.group(1).encode("utf-8").decode("unicode_escape", errors="ignore")
    body = raw[m.end():]
    return {
        "path": str(p.relative_to(ROOT)),
        "category": category,
        "title": title,
        "fm_url": url_m.group(1),
        "body": body,
    }


def detect(text: str, vocab: dict[str, list[str]]) -> list[str]:
    out = []
    for label, patterns in vocab.items():
        if any(re.search(p, text, re.I) for p in patterns):
            out.append(label)
    return out


def detect_locations(text: str) -> list[str]:
    found = set()
    text_low = text.lower()
    if "all 29 counties" in text_low or "statewide" in text_low or "any county" in text_low:
        return ["__statewide__"]
    for city, county in CITY_TO_COUNTY.items():
        if city in text_low:
            found.add(county)
    for county in LOCATIONS:
        if re.search(rf"\b{re.escape(county)}\s+county\b", text_low):
            found.add(county)
    return sorted(found)


def detect_stages(text: str) -> list[str]:
    return [k for k, patterns in STAGE_CUES.items() if any(re.search(p, text, re.I) for p in patterns)]


def primary_external(body: str) -> str | None:
    candidates = []
    for u in LINK_RE.findall(body):
        h = host(u)
        if not h or h.endswith("startup.utah.gov") or "url9183.utah.gov" in h:
            continue
        if h in {"sbir.gov", "sba.gov", "grants.gov"}:  # generic gov hubs are not the primary subject
            candidates.append((1, u, h))
        elif h.endswith(".gov") or h.endswith(".org") or h.endswith(".edu") or h.endswith(".com") or h.endswith(".net"):
            candidates.append((2, u, h))
    if not candidates:
        return None
    # First non-generic link wins.
    candidates.sort(key=lambda x: (-x[0], 0))
    return candidates[0][1]


def audit_one(doc: dict) -> dict:
    body = doc["body"]
    text = f"{doc['title']}\n\n{body}"
    industries = detect(text, INDUSTRIES)
    communities = detect(text, COMMUNITIES)
    locations = detect_locations(text)
    stages = detect_stages(text)
    program_signals = {k: bool(v.search(text)) for k, v in PROGRAM_SIGNALS.items()}
    primary_url = primary_external(body)
    coverage_score = sum([
        bool(industries),
        bool(communities) or "__statewide__" in locations,
        bool(locations),
        bool(stages),
        bool(primary_url),
        program_signals["apply"] or program_signals["dollar_amount"],
    ])
    return {
        "path": doc["path"],
        "category": doc["category"],
        "title": doc["title"],
        "fm_url": doc["fm_url"],
        "body_chars": len(body),
        "primary_external_url": primary_url,
        "industries": industries,
        "communities": communities,
        "locations": locations,
        "stage_cues": stages,
        "program_signals": program_signals,
        "is_guide_by_title": is_guide(doc["title"]),
        "coverage_score": coverage_score,  # 0–6
    }


def main() -> int:
    docs = []
    for d in TIER1_DIRS:
        cat_dir = CONTENT_ROOT / d
        if not cat_dir.exists():
            continue
        for p in sorted(cat_dir.glob("*.md")):
            if p.name.lower() == "readme.md":
                continue
            doc = parse_md(p, d)
            if doc:
                docs.append(doc)

    audits = [audit_one(d) for d in docs]
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(audits, indent=2))

    # Bucket 1 = NEW programs (we'll use a light heuristic: not flagged as guide).
    program_audits = [a for a in audits if not a["is_guide_by_title"]]
    guide_audits = [a for a in audits if a["is_guide_by_title"]]

    print(f"Wrote {len(audits)} audits → {OUT_PATH.relative_to(ROOT)}\n")

    print("=" * 110)
    print(f"PROGRAM-PROFILE AUDIT (n={len(program_audits)}) — coverage of resource detail-page fields")
    print("=" * 110)
    print(f"  {'category':<14}  {'title':<50}  body  ind  com  loc  stg  url  apl  $$$  score")
    print("  " + "-" * 105)
    for a in sorted(program_audits, key=lambda x: (-x["coverage_score"], x["category"], x["title"])):
        print(
            f"  {a['category']:<14}  "
            f"{a['title'][:48]:<50}  "
            f"{a['body_chars']:>4}  "
            f"{len(a['industries']):>3}  "
            f"{len(a['communities']):>3}  "
            f"{len(a['locations']):>3}  "
            f"{len(a['stage_cues']):>3}  "
            f"{'Y' if a['primary_external_url'] else '·':>3}  "
            f"{'Y' if a['program_signals']['apply'] else '·':>3}  "
            f"{'Y' if a['program_signals']['dollar_amount'] else '·':>3}  "
            f"{a['coverage_score']}/6"
        )

    # Histogram of scores
    print()
    score_buckets = {i: 0 for i in range(7)}
    for a in program_audits:
        score_buckets[a["coverage_score"]] += 1
    print("  coverage histogram:", " ".join(f"{s}:{n}" for s, n in score_buckets.items()))

    print()
    print("=" * 110)
    print(f"GUIDE ARTICLES (n={len(guide_audits)}) — these would NOT go into resources")
    print("=" * 110)
    for a in sorted(guide_audits, key=lambda x: (x["category"], x["title"])):
        print(f"  [{a['category']:<14}] {a['title']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
