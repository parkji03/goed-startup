#!/usr/bin/env python3
"""
Diff Tier 1 markdown (startup-utah-content/{resources,funding,state-programs})
against the existing resources CSV (data/resources-builder-day.csv).

For each markdown file:
  - Pull title + frontmatter URL
  - Pull external links from the body (likely the program's actual homepage)
  - Try to match by normalized title against CSV titles, then by host

Output buckets:
  MATCH       — markdown directly corresponds to a CSV row
  PARTIAL     — title fuzzy-matches a CSV row (>= ratio threshold)
  NEW         — no CSV equivalent found (candidate to add)
"""

from __future__ import annotations

import csv
import re
import sys
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "data" / "resources-builder-day.csv"
CONTENT_ROOT = ROOT / "startup-utah-content"
TIER1_DIRS = ["resources", "funding", "state-programs"]

FUZZY_THRESHOLD = 0.78  # title similarity for PARTIAL match

# Hub domains where many distinct programs live — host match alone is meaningless.
HUB_HOSTS = {
    "business.utah.gov",
    "utah.gov",
    "sba.gov",
    "score.org",
    "lassonde.utah.edu",  # hosts many sub-programs
    "uvu.edu",
    "suu.edu",
    "weber.edu",
    "usu.edu",
    "byu.edu",
    "themillatslcc.com",
    "ihubutah.org",  # also broad
}

# Articles whose title pattern signals "how-to / guide" rather than a program profile.
GUIDE_TITLE_PATTERNS = [
    re.compile(p, re.I)
    for p in [
        r"\bfive ways\b",
        r"\bsix things\b",
        r"\bhow to\b",
        r"\bwhat to\b",
        r"\b(?:tips|strategies|guide)\b",
        r"^ready to\b",
        r"^bolstering ",
        r"^prepare your\b",
        r"^networking[: ]",
        r"^pitch competitions[: ]",
        r"^small business funding[: ]",
        r"^explore grants",
        r"^turning your passion",
        r"^crowdfunding[: ]",
    ]
]


def is_guide_article(title: str) -> bool:
    return any(p.search(title) for p in GUIDE_TITLE_PATTERNS)


def norm_title(t: str) -> str:
    t = t.lower()
    t = re.sub(r"[‘’“”]", "'", t)
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def host(u: str) -> str:
    try:
        h = urlparse(u).netloc.lower()
        return h[4:] if h.startswith("www.") else h
    except Exception:
        return ""


@dataclass
class CsvRow:
    rid: str
    title: str
    url: str
    description: str
    norm_title: str = ""
    host: str = ""

    def __post_init__(self):
        self.norm_title = norm_title(self.title)
        self.host = host(self.url)


@dataclass
class MdDoc:
    path: Path
    category: str
    title: str
    fm_url: str
    body: str
    external_links: list[str] = field(default_factory=list)
    norm_title: str = ""

    def __post_init__(self):
        self.norm_title = norm_title(self.title)


def read_csv(p: Path) -> list[CsvRow]:
    rows = []
    with p.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            t = (r.get("Title") or "").strip()
            link = (r.get("link") or "").strip()
            if not t or not link:
                continue
            rows.append(
                CsvRow(
                    rid=r.get("id") or "",
                    title=t,
                    url=link,
                    description=(r.get("description") or "").strip(),
                )
            )
    return rows


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
LINK_RE = re.compile(r"\]\((https?://[^\s)]+)\)")


def parse_md(p: Path, category: str) -> MdDoc | None:
    raw = p.read_text(encoding="utf-8")
    m = FRONTMATTER_RE.match(raw)
    if not m:
        return None
    fm = m.group(1)
    title = re.search(r'^title:\s*"?(.+?)"?\s*$', fm, re.M)
    url = re.search(r"^url:\s*(\S+)\s*$", fm, re.M)
    if not title or not url:
        return None
    body = raw[m.end():]
    # Decode escaped unicode in titles like ’
    title_str = title.group(1).encode("utf-8").decode("unicode_escape", errors="ignore")
    links = LINK_RE.findall(body)
    # Filter out startup.utah.gov self-references and obvious tracking
    ext = []
    for u in links:
        h = host(u)
        if not h or h.endswith("startup.utah.gov"):
            continue
        if "url9183.utah.gov" in h:  # newsletter tracking shim
            continue
        ext.append(u)
    return MdDoc(
        path=p,
        category=category,
        title=title_str,
        fm_url=url.group(1),
        body=body,
        external_links=ext,
    )


def best_match(md: MdDoc, csv_rows: list[CsvRow]) -> tuple[CsvRow | None, float, str]:
    """Return (best_row, score, reason)."""
    # 1. Exact normalized title
    for r in csv_rows:
        if r.norm_title == md.norm_title and md.norm_title:
            return r, 1.0, "exact-title"
    # 2. Title containment (csv title contained in md title or vice versa, both length>=3 words)
    for r in csv_rows:
        if not r.norm_title:
            continue
        if (r.norm_title in md.norm_title or md.norm_title in r.norm_title) and len(
            r.norm_title.split()
        ) >= 2:
            return r, 0.95, "contained-title"
    # 3. Host match against any external link — but ignore hub domains that
    #    contain many distinct programs (false-positive prone).
    md_hosts = {host(u) for u in md.external_links if host(u)}
    md_hosts.discard("")
    md_hosts -= HUB_HOSTS
    for r in csv_rows:
        if r.host and r.host not in HUB_HOSTS and r.host in md_hosts:
            return r, 0.9, f"host-match:{r.host}"
    # 4. Fuzzy title
    best, best_score = None, 0.0
    for r in csv_rows:
        if not r.norm_title:
            continue
        s = SequenceMatcher(None, md.norm_title, r.norm_title).ratio()
        if s > best_score:
            best, best_score = r, s
    if best and best_score >= FUZZY_THRESHOLD:
        return best, best_score, "fuzzy-title"
    return None, best_score, "none"


def main() -> int:
    csv_rows = read_csv(CSV_PATH)
    print(f"Loaded {len(csv_rows)} CSV resources from {CSV_PATH.name}\n")

    md_docs: list[MdDoc] = []
    for d in TIER1_DIRS:
        cat_dir = CONTENT_ROOT / d
        if not cat_dir.exists():
            continue
        for p in sorted(cat_dir.glob("*.md")):
            if p.name.lower() == "readme.md":
                continue
            doc = parse_md(p, d)
            if doc:
                md_docs.append(doc)
    print(f"Parsed {len(md_docs)} Tier-1 markdown files\n")

    matched: list[tuple[MdDoc, CsvRow, str, float]] = []
    partial: list[tuple[MdDoc, CsvRow, str, float]] = []
    new: list[MdDoc] = []
    guides: list[MdDoc] = []

    for md in md_docs:
        if is_guide_article(md.title):
            guides.append(md)
            continue
        row, score, reason = best_match(md, csv_rows)
        if row and score >= 0.9:
            matched.append((md, row, reason, score))
        elif row and score >= FUZZY_THRESHOLD:
            partial.append((md, row, reason, score))
        else:
            new.append(md)

    width = max(len(md.path.name) for md in md_docs) + 2

    print("=" * 100)
    print(f"MATCH ({len(matched)}) — markdown directly mirrors a CSV row")
    print("=" * 100)
    for md, row, reason, score in sorted(matched, key=lambda x: (x[0].category, x[0].path.name)):
        md_chars = len(md.body)
        csv_chars = len(row.description)
        gain = md_chars - csv_chars
        print(
            f"  [{md.category:13}] {md.path.name:<{width}} "
            f"→ #{row.rid} {row.title[:42]:<42} "
            f"[{reason}, +{gain:>5} chars body vs CSV desc]"
        )

    print()
    print("=" * 100)
    print(f"PARTIAL ({len(partial)}) — fuzzy match, review needed")
    print("=" * 100)
    for md, row, reason, score in sorted(partial, key=lambda x: -x[3]):
        print(
            f"  [{md.category:13}] {md.title[:55]:<55}  ≈  {row.title[:55]:<55}  "
            f"[{reason} {score:.2f}]"
        )

    print()
    print("=" * 100)
    print(f"NEW ({len(new)}) — no CSV equivalent (candidates to add)")
    print("=" * 100)
    for md in sorted(new, key=lambda x: (x.category, x.path.name)):
        primary_ext = md.external_links[0] if md.external_links else "(none)"
        print(
            f"  [{md.category:13}] {md.title[:60]:<60}  →  {primary_ext[:50]}"
        )

    print()
    print("=" * 100)
    print(f"GUIDES ({len(guides)}) — how-to / educational articles, not program profiles")
    print("=" * 100)
    for md in sorted(guides, key=lambda x: (x.category, x.path.name)):
        print(f"  [{md.category:13}] {md.title[:80]}")

    # Spot-check programs I previously flagged as probably missing.
    print()
    print("=" * 100)
    print("PROBE — do these specific programs exist in the CSV?")
    print("=" * 100)
    probes = [
        "Nucleus Institute",
        "Nucleus Fund",
        "Nucleus Grow",
        "Center for Rural Development",
        "Rural County Grant",
        "Rural Communities Opportunity Grant",
        "Office of Regulatory Relief",
        "Regulatory Sandbox",
        "1 Million Cups",
        "BioHive",
        "Everyday Entrepreneur",
        "Talent Ready Utah",
        "VBOC",
        "Veterans Business Outreach",
        "SBIR",
        "STTR",
        "Walmart Open Call",
        "Morgan Stanley",
        "Salt Lake Angels",
        "Park City Angels",
        "Kickstart",
        "Pelion",
        "Convoi",
        "RevRoad",
        "Recursion",
    ]
    for needle in probes:
        n = needle.lower()
        hits = [r for r in csv_rows if n in r.title.lower() or n in r.description.lower()]
        marker = "✅" if hits else "❌ MISSING"
        sample = hits[0].title[:60] if hits else ""
        print(f"  {marker:13} {needle:42} {('→ #' + hits[0].rid + ' ' + sample) if hits else ''}")

    print()
    print("─" * 60)
    print(f"  matched: {len(matched)}   partial: {len(partial)}   new: {len(new)}   guides: {len(guides)}")
    print(f"  total tier-1 markdown: {len(md_docs)}")
    print(f"  total CSV resources:   {len(csv_rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
