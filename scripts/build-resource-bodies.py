#!/usr/bin/env python3
"""
P2.2 — Build data/resource-bodies.json: a curated mapping of resource sourceId
→ cleaned markdown body, ready for the P2.3 patchBody flow.

Strategy:
  1. Hand-curated allowlist of (markdown_stem → csv_sourceId) pairs. The
     diff script's auto-matches had false positives (The Mill→VBRC,
     UVU accelerator→Custom Fit, etc.) and missed correct matches that
     the diff filtered as hub-host noise. Curating by hand is faster and
     more reliable at this scale.
  2. For each pair, read the markdown body and clean scrape artifacts:
       - drop frontmatter
       - drop the "Source: <url>" line
       - drop trailing legal-disclaimer paragraph
       - drop the cross-promotional CTA paragraph at the bottom
       - rewrite tracker URLs (url9183.utah.gov/ls/click?...) to '#'
       - strip image markdown that points at WP uploads (broken assets)
  3. Emit JSON: [{ sourceId, sourceMdPath, body }]

The content-derived rows from Phase 1 are also included so they get the
same body treatment — body comes from the same markdown that produced
their description.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "startup-utah-content"
OUT_JSON = ROOT / "data" / "resource-bodies.json"

# ---------------------------------------------------------------------------
# Curated mapping: (markdown_stem under startup-utah-content/<category>/) →
# CSV sourceId (or "content:..." for content-derived rows from Phase 1).
#
# Each entry is a tuple (relative_md_path, sourceId). Keep it explicit so the
# review trail is obvious. Decisions captured inline.
# ---------------------------------------------------------------------------
MAPPINGS: list[tuple[str, str]] = [
    # ---- CSV-row enrichments (clean matches from diff) ----
    ("funding/2025-midyear-snapshot-of-the-get-started-business-idea-challenge.md", "2622"),
    ("funding/secure-government-contracts-with-the-help-of-utahs-apex-accelerator.md", "2646"),
    ("funding/turn-ideas-into-action-with-the-startup-states-new-funding-challenge.md", "2649"),
    ("funding/utah-angel-investor-groups-fuel-startup-growth-across-the-state.md", "2614"),
    ("resources/altitude-lab-the-accelerator-leading-utahs-biotech-investment.md", "2645"),
    ("resources/experience-equity-free-acceleration-with-convoi-ventures.md", "2605"),
    ("resources/how-a-statewide-coalition-is-fueling-entrepreneurship-in-rural-utah.md", "2674"),
    ("resources/san-juan-chambers-revival-marks-a-turning-point-in-rural-utah.md", "2713"),
    ("resources/sbdcs-free-support-to-help-small-businesses-start-and-grow.md", "2647"),
    ("resources/silicon-slopes-introduces-fee-free-program-to-strengthen-startup-ecosystem.md", "2623"),
    # ---- CSV-row enrichments (verifier-confirmed; auto-diff filtered as hubs) ----
    ("funding/usbci-bridging-the-gap-between-banks-and-disadvantaged-communities.md", "2592"),
    ("resources/ihub-utah-empowering-the-next-generation-of-entrepreneurs.md", "2620"),
    ("resources/how-the-lassonde-entrepreneur-institute-is-driving-student-innovation-in-utah.md", "2582"),
    ("funding/pitch-your-startup-at-the-one-utah-summit-with-50k-in-cash-prizes.md", "2629"),
    ("resources/utah-center-for-rural-development-fuels-economic-growth-across-the-state.md", "2682"),
    # ---- Content-derived rows from Phase 1 (sourceId starts with "content:") ----
    ("resources/the-nucleus-institute-helping-innovative-tech-flourish-in-utah.md", "content:the-nucleus-institute-helping-innovative-tech-flourish-in-utah"),
    ("state-programs/the-office-of-regulatory-relief-helping-utah-businesses-overcome-burdensome-regulations.md", "content:the-office-of-regulatory-relief-helping-utah-businesses-overcome-burdensome-regulations"),
    ("funding/economic-assistance-grant-makes-available-4-5m-for-industry-and-community-development.md", "content:economic-assistance-grant-makes-available-4-5m-for-industry-and-community-development"),
    ("funding/utah-supports-economic-growth-with-post-performance-tax-program.md", "content:utah-supports-economic-growth-with-post-performance-tax-program"),
    ("resources/university-of-utah-supports-innovation-for-remote-and-austere-areas.md", "content:university-of-utah-supports-innovation-for-remote-and-austere-areas"),
    ("resources/level-up-your-career-with-uvus-professional-education-courses.md", "content:level-up-your-career-with-uvus-professional-education-courses"),
    ("resources/sba-certifications-that-could-fast-track-your-startups-growth.md", "content:sba-certifications-that-could-fast-track-your-startups-growth"),
]

# Articles deliberately excluded — kept here as documentation so we don't
# accidentally re-add them later. Comment per entry explains why.
EXCLUDED: list[tuple[str, str]] = [
    # False positives the auto-diff produced — articles aren't actually about
    # the matched program.
    ("resources/growing-utahs-next-generation-of-businesses-at-the-mill.md",
     "matched VBRC by stray utahvbrc.org link, but article is about The Mill at SLCC"),
    ("resources/transform-your-business-with-uvus-advanced-business-accelerator-course.md",
     "matched Custom Fit Training by ushe.edu host, but article is about UVU's accelerator course"),
    ("resources/utah-center-for-rural-development-fuels-economic-growth-across-the-state.md",
     "auto-diff matched SBDC by an utahsbdc.org cross-link; we map it to CRD #2682 above"),
    # Multi-program survey articles — body would be misleading on a single
    # row's detail page. Better candidates for the guides collection (P3.3).
    ("resources/discover-the-best-workspace-to-maximize-growth-for-your-startup.md",
     "workspace survey covering many providers"),
    ("resources/how-local-chambers-help-small-businesses-thrive-in-utah.md",
     "general chamber overview, not specific to RUCC"),
    ("resources/support-your-business-with-industry-organizations.md",
     "industry-org survey covering 47G + many others"),
    ("resources/where-women-in-utah-can-find-support-for-business-growth.md",
     "women-support survey covering WTC + many others"),
    ("resources/sbdc-trainings-a-closer-look-at-the-wordpress-workshop.md",
     "specific workshop too narrow to enrich the SBDC parent row"),
    # Self-referential.
    ("resources/how-the-startup-state-chatbot-can-assist-you.md",
     "article is about the chatbot itself; not a program"),
    # News-shaped, not program-defining.
    ("resources/baugh-family-donation-fuels-next-generation-of-entrepreneurs-at-uvu.md",
     "donation news, not the UVU entrepreneurship program profile"),
    ("resources/ihubs-ase-program-is-turning-student-ambition-into-viable-ventures.md",
     "iHub sub-program; parent iHub article (#2620) already covers it"),
    # Ambiguous parent — points at multiple resources via SBIR network.
    ("funding/sbir-and-sttr-programs-grant-funding-to-innovative-deep-tech-products.md",
     "general SBIR/STTR explainer; not specific to Utah Innovation Center"),
    # Multi-resource explainers — better as guides.
    ("funding/small-business-funding-finding-the-best-option-for-your-needs.md", "guide content"),
    ("funding/explore-grants-to-propel-your-business-forward.md", "guide content"),
    ("funding/crowdfunding-a-democratized-way-to-raise-capital.md", "guide content"),
    ("funding/pitch-competitions-providing-funding-feedback-and-validation-for-utah-startups.md", "guide content"),
    ("funding/prepare-your-utah-business-to-apply-for-up-to-200k-in-project-based-funding.md", "guide content"),
]

# --- Body cleaning ----------------------------------------------------------

FRONTMATTER_RE = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)
SOURCE_LINE_RE = re.compile(r"^Source:\s*<https?://[^>]+>\s*\n", re.MULTILINE)
TRACKER_HOST = "url9183.utah.gov"
DISCLAIMER_RE = re.compile(
    r"\n\*\s*\*\s*\*\s*\n.*?The information in this article is current.*?$",
    re.DOTALL,
)
CTA_RE = re.compile(
    r"\nLooking to support your small business in Utah\?.*?(?=\n\*\s*\*\s*\*|\Z)",
    re.DOTALL,
)
WP_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(https?://[^)]*wp-content/uploads/[^)]+\)\s*\n?")
LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)\s]+)\)")
H1_DUP_RE = re.compile(r"^# .+\n+", re.MULTILINE)


def clean_body(raw: str, title: str) -> str:
    body = raw

    # 1. Strip frontmatter.
    body = FRONTMATTER_RE.sub("", body, count=1)

    # 2. Drop the leading "# <title>" duplicate (frontmatter already had title).
    body = body.replace(f"# {title}\n", "", 1)

    # 3. Drop the Source: line.
    body = SOURCE_LINE_RE.sub("", body, count=1)

    # 4. Drop the boilerplate disclaimer at the end.
    body = DISCLAIMER_RE.sub("", body)

    # 5. Drop the cross-promotional "Looking to support your small business…" CTA.
    body = CTA_RE.sub("", body)

    # 6. Drop WordPress image links (broken in our app).
    body = WP_IMAGE_RE.sub("", body)

    # 7. Replace tracker links with their anchor text only (kill the URL).
    def _rewrite_link(m: re.Match) -> str:
        anchor, url = m.group(1), m.group(2)
        host = urlparse(url).netloc.lower()
        if TRACKER_HOST in host:
            return anchor  # plain text — no clickable target
        return m.group(0)
    body = LINK_RE.sub(_rewrite_link, body)

    # 8. Collapse runs of blank lines.
    body = re.sub(r"\n{3,}", "\n\n", body)

    return body.strip() + "\n"


# --- Main -------------------------------------------------------------------

def main() -> int:
    out: list[dict] = []
    seen: set[str] = set()
    for rel, source_id in MAPPINGS:
        if source_id in seen:
            print(f"WARN duplicate sourceId in mapping: {source_id} ({rel})")
            continue
        seen.add(source_id)
        path = CONTENT / rel
        if not path.exists():
            print(f"FAIL missing markdown: {rel}")
            return 2
        raw = path.read_text(encoding="utf-8")
        # Pull the title for the H1 dedupe.
        m = re.search(r'^title:\s*"?(.+?)"?\s*$', raw, re.MULTILINE)
        title = m.group(1) if m else ""
        try:
            title = title.encode("utf-8").decode("unicode_escape", errors="ignore")
        except Exception:
            pass
        body = clean_body(raw, title)
        out.append({
            "sourceId": source_id,
            "sourceMdPath": f"startup-utah-content/{rel}",
            "body": body,
        })
        print(f"  ok  {source_id:60}  {len(body):>5} chars  ←  {rel}")

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"\nWrote {len(out)} body mappings → {OUT_JSON.relative_to(ROOT)}")
    print(f"({len(EXCLUDED)} candidates documented as excluded; see EXCLUDED in this script.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
