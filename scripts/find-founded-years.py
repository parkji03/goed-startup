#!/usr/bin/env python3
"""Find founded year for each company via DuckDuckGo HTML search.

Strategy: query DDG SERP for "<name> founded" and pick the most common year
appearing in patterns like "founded in YYYY". SERPs aggregate snippets from
Crunchbase/PitchBook/LinkedIn/etc., so multiple sources usually agree, which
makes mode-of-years a robust signal.
"""
import argparse
import asyncio
import csv
import re
import sys
import time
from collections import Counter
from urllib.parse import quote_plus

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

INPUT_CSV = "Map Data for Builder Day  - Sheet1.csv"
OUTPUT_CSV = "Map Data for Builder Day - with-founded.csv"

# Patterns that strongly imply a *founding* year — ordered by reliability.
PRIMARY_PATTERNS = [
    re.compile(r"founded\s+in\s+(\d{4})", re.I),
    re.compile(r"was\s+founded\s+(?:in\s+)?(\d{4})", re.I),
    re.compile(r"founded\s*[:\-]\s*(\d{4})", re.I),
    re.compile(r"founding\s+year[:\s]+(\d{4})", re.I),
    re.compile(r"established\s+in\s+(\d{4})", re.I),
    re.compile(r"established\s*[:\-]?\s*(\d{4})", re.I),
    re.compile(r"\bin\s+(\d{4})[,.]?\s+(?:[A-Z][\w\s]+?\s+)?(?:founded|started|launched)", re.I),
    re.compile(r"started\s+in\s+(\d{4})", re.I),
    re.compile(r"launched\s+in\s+(\d{4})", re.I),
    re.compile(r"incorporated\s+in\s+(\d{4})", re.I),
]
WEAK_PATTERNS = [
    re.compile(r"\bsince\s+(\d{4})", re.I),
    re.compile(r"\best\.?\s+(\d{4})", re.I),
]


def clean_md(text: str) -> str:
    # Strip markdown bold/italic/backtick markers so regexes match across them.
    return re.sub(r"[*_`]+", "", text or "")


def collect_years(text: str, patterns) -> list[int]:
    years = []
    if not text:
        return years
    text = clean_md(text)
    for pat in patterns:
        for m in pat.finditer(text):
            try:
                y = int(m.group(1))
            except (ValueError, IndexError):
                continue
            if 1900 <= y <= 2026:
                years.append(y)
    return years


def collect_year_matches(text: str, patterns) -> list[tuple[int, int, int]]:
    """Return (year, start, end) tuples for each match, for proximity scoring."""
    out = []
    if not text:
        return out
    text = clean_md(text)
    for pat in patterns:
        for m in pat.finditer(text):
            try:
                y = int(m.group(1))
            except (ValueError, IndexError):
                continue
            if 1900 <= y <= 2026:
                out.append((y, m.start(), m.end()))
    return out


def best_year(serp_text: str, name: str = "", domain: str = "") -> tuple[int, str] | None:
    """Pick the most likely founding year.

    Strategy: prefer years whose surrounding window (±120 chars) contains the
    company name or domain stem — that filters out matches for unrelated
    entities that share a SERP page (e.g. a different "Roger" or a parent
    company under the same LinkedIn slug). Falls back to mode-of-all-years
    when no name-adjacent matches exist.
    """
    cleaned = clean_md(serp_text)
    matches = collect_year_matches(cleaned, PRIMARY_PATTERNS)
    if matches:
        # Two-tier proximity:
        #   STRONG keywords (full domain, 4+ char stem) are unique enough that
        #   a window match strongly implies the right company.
        #   WEAK keywords (bare name, short stems) appear in unrelated entries
        #   too — usable only as a secondary filter.
        stem = ""
        if domain:
            d = domain.split("/")[0]
            parts = d.split(".")
            if parts and parts[0] in ("www", "app", "shop", "go"):
                parts = parts[1:]
            stem = parts[0] if parts else ""
        strong = [k.lower() for k in [domain, stem if len(stem) >= 4 else ""] if k]
        weak = [k.lower() for k in [name, stem] if k and len(k) >= 2]
        # Don't double-count
        weak = [k for k in weak if k not in strong]

        scored = []
        for y, start, end in matches:
            window = cleaned[max(0, start - 120) : end + 120].lower()
            strong_hit = any(k in window for k in strong) if strong else False
            weak_hit = any(k in window for k in weak) if weak else False
            scored.append((y, strong_hit, weak_hit, start, end))

        # Prefer strong-adjacent matches.
        strong_years = [s[0] for s in scored if s[1]]
        if strong_years:
            year, _ = Counter(strong_years).most_common(1)[0]
            for y, sh, wh, start, end in scored:
                if y == year and sh:
                    snip = cleaned[max(0, start - 60) : end + 60].replace("\n", " ")
                    return year, snip.strip()

        # Weak fallback fires only when all weak-adjacent matches agree —
        # otherwise we risk picking a wrong-entity year that happens to be
        # mentioned more often in the SERP (e.g., a magazine called "Remi"
        # outranking the actual roofing startup).
        weak_years = [s[0] for s in scored if s[2]]
        if weak_years and len(set(weak_years)) == 1:
            year = weak_years[0]
            for y, sh, wh, start, end in scored:
                if y == year and wh:
                    snip = cleaned[max(0, start - 60) : end + 60].replace("\n", " ")
                    return year, snip.strip()
        return None
    weak = collect_years(cleaned, WEAK_PATTERNS)
    if weak:
        year, _ = Counter(weak).most_common(1)[0]
        return year, "(weak: 'since/est.')"
    return None


def domain_hint(website: str) -> str:
    if not website:
        return ""
    w = website.strip().lower()
    w = w.replace("http://", "").replace("https://", "").rstrip("/")
    # Drop path
    w = w.split("/")[0]
    return w


def domain_stem(website: str) -> str:
    """Brand portion of the domain — e.g. 'tryroger' from 'www.tryroger.com'."""
    d = domain_hint(website)
    if not d:
        return ""
    parts = d.split(".")
    if parts and parts[0] in ("www", "app", "shop", "go"):
        parts = parts[1:]
    return parts[0] if parts else ""


def linkedin_slug(linkedin_url: str) -> str:
    if not linkedin_url:
        return ""
    m = re.search(r"/company/([^/?#]+)", linkedin_url)
    return m.group(1) if m else ""


async def fetch_serp(crawler, query: str):
    url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
    config = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,
        page_timeout=20000,
        word_count_threshold=5,
        verbose=False,
    )
    result = await crawler.arun(url=url, config=config)
    if not result.success or not result.markdown:
        return None, url
    return str(result.markdown), url


async def find_year(crawler, name: str, website: str, linkedin: str = ""):
    domain = domain_hint(website)
    slug = linkedin_slug(linkedin)
    queries: list[str] = []
    # Primary: quoted name + domain (high precision)
    q1 = f'"{name}" founded year'
    if domain:
        q1 += f" {domain}"
    queries.append(q1)
    # Fallback 1: LinkedIn slug + founded (high specificity for common-word names)
    if slug and slug.lower() != name.lower():
        queries.append(f"{slug} founded year")
    # Fallback 2: domain stem + founded
    if domain:
        queries.append(f"{domain} founded year")

    for q in queries:
        serp, url = await fetch_serp(crawler, q)
        if not serp:
            continue
        hit = best_year(serp, name=name, domain=domain)
        if hit:
            year, snippet = hit
            return year, url, snippet
    return None, url if queries else "", ""


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--input", default=INPUT_CSV)
    parser.add_argument("--output", default=OUTPUT_CSV)
    args = parser.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if args.limit:
        rows = rows[: args.limit]
    print(f"Processing {len(rows)} companies (concurrency={args.concurrency})", file=sys.stderr)

    sem = asyncio.Semaphore(args.concurrency)
    results: list[dict] = [None] * len(rows)

    async with AsyncWebCrawler() as crawler:
        async def process(i, row):
            async with sem:
                name = row["Startup Name "].strip()
                website = row["Website"].strip()
                linkedin = row.get("LinkedIn Link (map it to Links to get the logo)", "").strip()
                if not name:
                    results[i] = {"year": None, "src": "", "snippet": ""}
                    return
                t0 = time.time()
                try:
                    year, src, snippet = await find_year(crawler, name, website, linkedin)
                except Exception as e:
                    year, src, snippet = None, "", f"error: {e}"
                dt = time.time() - t0
                status = f"✓ {year}" if year else "—"
                print(f"[{i+1}/{len(rows)}] {status:<10} {name} ({dt:.1f}s)", file=sys.stderr, flush=True)
                if snippet and year:
                    print(f"    {snippet[:140]}", file=sys.stderr)
                results[i] = {"year": year, "src": src or "", "snippet": snippet}

        await asyncio.gather(*[process(i, r) for i, r in enumerate(rows)])

    fieldnames = list(rows[0].keys()) + ["Founded Year", "Founded Source"]
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row, res in zip(rows, results):
            row = dict(row)
            row["Founded Year"] = res["year"] if res and res["year"] else ""
            row["Founded Source"] = res["src"] if res else ""
            writer.writerow(row)

    found = sum(1 for r in results if r and r["year"])
    print(f"\nDone. Found year for {found}/{len(results)} companies", file=sys.stderr)
    print(f"Output: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
