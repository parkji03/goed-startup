#!/usr/bin/env python3
"""
For each Bucket-1 candidate program, decide whether it already exists in the
CSV catalog or is truly missing. Used as gate-keeping input for P1.1.

Match rules (strict — host-only on hub domains is NOT enough):
  STRONG  Name match — any of the candidate's program names matches
          /\\b<name>\\b/ in CSV title|description|link.
  STRONG  URL match — candidate's primary_external_url and a CSV `link`
          share host AND first path segment (after normalization).
  WEAK    Same host but different path AND host is NOT a hub. (Reported as
          MAYBE so a human can disambiguate; not auto-treated as EXISTS.)

Hub host-only matches are dropped: hubs (business.utah.gov, lassonde.utah.edu,
uvu.edu, suu.edu, etc.) host many distinct programs, so the hostname alone is
not evidence of duplication.

Outputs:
  • Printed table for review.
  • scripts/out/missing-programs.json — canonical input for P1.1.
"""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "scripts" / "out" / "tier1-audit.json"
CSV_PATH = ROOT / "data" / "resources-builder-day.csv"
OUT_JSON = ROOT / "scripts" / "out" / "missing-programs.json"

# Hub hosts where many distinct programs live. A bare hostname match against
# one of these is meaningless — distinct programs live at distinct paths.
HUB_HOSTS = {
    "business.utah.gov",
    "utah.gov",
    "sba.gov",
    "score.org",
    "grants.gov",
    "sbir.gov",
    "lassonde.utah.edu",
    "uvu.edu",
    "suu.edu",
    "weber.edu",
    "usu.edu",
    "byu.edu",
    "ushe.edu",
    "themillatslcc.com",
    "ihubutah.org",
}


def normalize_host(u: str) -> str:
    h = urlparse(u).netloc.lower()
    return h[4:] if h.startswith("www.") else h


def first_path_segment(u: str) -> str:
    """First non-empty path segment, lowercased. '' for the bare host."""
    p = urlparse(u).path or ""
    parts = [seg for seg in p.split("/") if seg]
    return parts[0].lower() if parts else ""


# Map: audit-path-stem → program-name candidates expected in CSV.
# For 'sub-program of an existing parent', we treat the parent's existence as
# enough — we do NOT want a 'truly missing' verdict for sub-programs of rows
# that already exist (e.g., iHub ASE under iHub).
PROGRAM_NAMES: dict[str, list[str]] = {
    "the-nucleus-institute-helping-innovative-tech-flourish-in-utah": ["Nucleus Institute", "Nucleus Fund", "Nucleus Grow", "nucleusutah"],
    "the-office-of-regulatory-relief-helping-utah-businesses-overcome-burdensome-regulations": ["Regulatory Relief", "Regulatory Sandbox"],
    "economic-assistance-grant-makes-available-4-5m-for-industry-and-community-development": ["Economic Assistance Grant"],
    "utah-supports-economic-growth-with-post-performance-tax-program": ["Post-Performance Tax", "EDTIF", "PTET"],
    "utah-startups-apply-now-for-walmarts-open-call-pitch-competition": ["Walmart Open Call"],
    "two-utah-startups-named-winners-in-morgan-stanleys-pitch-competition": ["Morgan Stanley Multicultural", "Morgan Stanley Pitch"],
    "sbir-and-sttr-programs-grant-funding-to-innovative-deep-tech-products": ["SBIR", "STTR", "Utah Innovation Center"],
    "university-of-utah-supports-innovation-for-remote-and-austere-areas": ["austere", "remote and austere"],
    "ihub-utah-empowering-the-next-generation-of-entrepreneurs": ["iHub"],
    "ihubs-ase-program-is-turning-student-ambition-into-viable-ventures": ["iHub"],  # parent
    "level-up-your-career-with-uvus-professional-education-courses": ["UVU Professional Education", "UVU Continuing Education", "UVU Entrepreneur"],
    "baugh-family-donation-fuels-next-generation-of-entrepreneurs-at-uvu": ["UVU Entrepreneur", "Woodbury"],
    "how-the-lassonde-entrepreneur-institute-is-driving-student-innovation-in-utah": ["Lassonde Entrepreneur"],
    "empowering-utah-entrepreneurs-with-sbdc-entrepreneur-academy": ["SBDC", "Small Business Development Center"],
    "sba-certifications-that-could-fast-track-your-startups-growth": ["SBA certification", "HUBZone", "WOSB", "VOSB", "8(a) certification"],
    "locally-grown-locally-owned-the-power-of-utahs-farmers-markets": ["Farmers Market", "Utah's Own"],
    "business-elevated-podcast-showcases-utahs-thriving-entrepreneurial-scene": ["Business Elevated"],
    "helping-utah-startups-thrive-the-power-of-incubators-and-accelerators": [],  # generic guide article
    "usbci-bridging-the-gap-between-banks-and-disadvantaged-communities": ["USBCI", "Utah Small Business Credit"],
    "goeo-providing-startup-assistance-for-any-industry-at-every-stage": ["Governor's Office of Economic Opportunity", "GOEO"],
    "pitch-your-startup-at-the-one-utah-summit-with-50k-in-cash-prizes": ["One Utah Summit"],
    "utah-center-for-rural-development-fuels-economic-growth-across-the-state": ["Utah Center for Rural Development", "Center for Rural Development"],
}


def name_hits(names: list[str], csv_rows: list[dict]) -> list[tuple[str, str, str]]:
    """Return (csv_id, csv_title, matched_name) for word-boundary name matches."""
    out: list[tuple[str, str, str]] = []
    for name in names:
        if not name:
            continue
        # Word boundaries around the whole phrase. Lowercase compare.
        pat = re.compile(r"\b" + re.escape(name.lower()) + r"\b")
        for r in csv_rows:
            blob = " | ".join([r.get("Title") or "", r.get("description") or "", r.get("link") or ""]).lower()
            if pat.search(blob):
                out.append((r["id"], r.get("Title") or "", name))
    # De-dup by csv_id, keep first hit (longest matched name first if multiple).
    seen: set[str] = set()
    deduped: list[tuple[str, str, str]] = []
    for h in sorted(out, key=lambda x: -len(x[2])):
        if h[0] in seen:
            continue
        seen.add(h[0])
        deduped.append(h)
    return deduped


def url_hits(primary: str, csv_rows: list[dict]) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """
    Return (strong, weak):
      strong = same host AND same first path segment (e.g., business.utah.gov/regulatory-relief
               vs business.utah.gov/regulatory-relief/sandbox → MATCH)
      weak   = same host BUT different first path segment AND host is NOT a hub (uncertain)
    """
    strong: list[tuple[str, str]] = []
    weak: list[tuple[str, str]] = []
    if not primary:
        return strong, weak
    ph = normalize_host(primary)
    pseg = first_path_segment(primary)
    if not ph:
        return strong, weak
    for r in csv_rows:
        link = r.get("link") or ""
        if not link:
            continue
        rh = normalize_host(link)
        if not rh or rh != ph:
            continue
        rseg = first_path_segment(link)
        if rseg == pseg:
            strong.append((r["id"], r.get("Title") or ""))
        elif ph not in HUB_HOSTS:
            weak.append((r["id"], r.get("Title") or ""))
    return strong, weak


def main() -> int:
    if not AUDIT.exists():
        print(f"Missing {AUDIT}. Run scripts/audit-content-metadata.py first.", file=sys.stderr)
        return 2

    audits = json.loads(AUDIT.read_text())
    audits_by_stem = {Path(a["path"]).stem: a for a in audits}
    csv_rows = list(csv.DictReader(CSV_PATH.open()))

    # Catch the silent-skip class of bug: every PROGRAM_NAMES key must point to
    # a real audit file, otherwise the verdict is just absent from the output.
    orphan_stems = [s for s in PROGRAM_NAMES if s not in audits_by_stem]
    if orphan_stems:
        print("WARNING: PROGRAM_NAMES keys without a matching audit entry:", file=sys.stderr)
        for s in orphan_stems:
            print(f"  - {s}", file=sys.stderr)
        print("", file=sys.stderr)

    exists: list[dict] = []
    missing: list[dict] = []
    maybe: list[dict] = []

    print(f"{'STATUS':<8}  {'TITLE':<60}  EVIDENCE")
    print("-" * 130)
    for stem, names in PROGRAM_NAMES.items():
        a = audits_by_stem.get(stem)
        if not a:
            continue
        title = a["title"][:58]
        primary = a.get("primary_external_url") or ""

        n_hits = name_hits(names, csv_rows)
        u_strong, u_weak = url_hits(primary, csv_rows)

        if n_hits or u_strong:
            ev = []
            for rid, rt, nm in n_hits[:2]:
                ev.append(f"name='{nm}' → #{rid} {rt[:30]}")
            for rid, rt in u_strong[:2]:
                ev.append(f"url-match → #{rid} {rt[:30]}")
            print(f"{'EXISTS':<8}  {title:<60}  {' | '.join(ev)[:90]}")
            exists.append({
                "stem": stem,
                "title": a["title"],
                "primary_url": primary,
                "evidence": ev,
            })
        elif u_weak:
            ev = [f"weak host-match → #{rid} {rt[:30]}" for rid, rt in u_weak[:2]]
            print(f"{'MAYBE':<8}  {title:<60}  {' | '.join(ev)[:90]}")
            maybe.append({
                "stem": stem,
                "title": a["title"],
                "primary_url": primary,
                "evidence": ev,
            })
        else:
            print(f"{'MISSING':<8}  {title:<60}  primary={primary[:60]}")
            missing.append({
                "stem": stem,
                "title": a["title"],
                "primary_url": primary,
                "path": a["path"],
            })

    print()
    print(f"  exists:  {len(exists)}")
    print(f"  maybe:   {len(maybe)}   (review by hand — same host, different path, non-hub)")
    print(f"  missing: {len(missing)}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({
        "missing": missing,
        "maybe": maybe,
        "exists": exists,
    }, indent=2))
    print(f"\nCanonical truly-missing list → {OUT_JSON.relative_to(ROOT)}")

    if missing:
        print()
        print("=" * 110)
        print("TRULY MISSING — candidates for P1.1 enrichment + import")
        print("=" * 110)
        for m in missing:
            print(f"  • {m['title']}")
            print(f"      primary_url: {m['primary_url']}")
            print(f"      source:      {m['path']}")

    if maybe:
        print()
        print("=" * 110)
        print("MAYBE — same host, different path, non-hub. Review by hand.")
        print("=" * 110)
        for m in maybe:
            print(f"  • {m['title']}")
            print(f"      primary_url: {m['primary_url']}")
            print(f"      evidence:    {m['evidence']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
