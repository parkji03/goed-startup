#!/usr/bin/env python3
"""Find company logo URLs.

Strategy (per company), best-quality first:
  1. <meta property="og:image"> — intentional brand image used by LinkedIn/
     Slack/Twitter unfurls. Usually the cleanest logo when set.
  2. <link rel="apple-touch-icon"> — sized for iOS home screen (typically
     180x180+) and almost always a logo, not a favicon.
  3. DuckDuckGo's public favicon CDN (icons.duckduckgo.com/ip3/<domain>.ico).
     Always returns something but lower resolution.

Writes a new CSV with `Logo URL` and `Logo Source` columns. Source is one of:
  og:image | apple-touch-icon | ddg-favicon | none

Note: Clearbit's free logo API was retired after the HubSpot acquisition;
DDG's CDN is the best zero-auth replacement.
"""
import argparse
import asyncio
import csv
import re
import sys
import time
from urllib.parse import urljoin, urlparse

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode

INPUT_CSV = "Map Data for Builder Day - with-founded.csv"
OUTPUT_CSV = "Map Data for Builder Day - with-logos.csv"

OG_PATTERNS = [
    re.compile(
        r'<meta[^>]+property=["\']og:image(?::secure_url|:url)?["\'][^>]+content=["\']([^"\']+)["\']',
        re.I,
    ),
    re.compile(
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image(?::secure_url|:url)?["\']',
        re.I,
    ),
    re.compile(
        r'<meta[^>]+name=["\']twitter:image(?::src)?["\'][^>]+content=["\']([^"\']+)["\']',
        re.I,
    ),
]

APPLE_ICON_PATTERNS = [
    re.compile(
        r'<link[^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\'][^>]*?href=["\']([^"\']+)["\']',
        re.I,
    ),
    re.compile(
        r'<link[^>]+href=["\']([^"\']+)["\'][^>]+rel=["\']apple-touch-icon(?:-precomposed)?["\']',
        re.I,
    ),
]


def normalize_url(url: str) -> str | None:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def get_domain(website: str) -> str | None:
    base = normalize_url(website)
    if not base:
        return None
    try:
        host = urlparse(base).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        return host or None
    except Exception:
        return None


def _resolve(img: str, base_url: str) -> str:
    img = img.strip()
    if img.startswith("//"):
        return "https:" + img
    if img.startswith("/"):
        return urljoin(base_url, img)
    return img


def extract_meta_image(html: str, base_url: str, patterns) -> str | None:
    if not html:
        return None
    for pat in patterns:
        m = pat.search(html)
        if m:
            img = m.group(1).strip()
            if img:
                return _resolve(img, base_url)
    return None


async def fetch_logo(crawler, website: str):
    base = normalize_url(website)
    domain = get_domain(website)
    if not base:
        return None, "none"

    config = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,
        page_timeout=15000,
        word_count_threshold=1,
        verbose=False,
    )
    try:
        result = await crawler.arun(url=base, config=config)
        if result.success and result.html:
            og = extract_meta_image(result.html, base, OG_PATTERNS)
            if og:
                return og, "og:image"
            apple = extract_meta_image(result.html, base, APPLE_ICON_PATTERNS)
            if apple:
                return apple, "apple-touch-icon"
    except Exception as e:
        print(f"   ! crawl error on {base}: {e}", file=sys.stderr)

    if domain:
        return f"https://icons.duckduckgo.com/ip3/{domain}.ico", "ddg-favicon"
    return None, "none"


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=8)
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
                if not name:
                    results[i] = {"url": "", "source": ""}
                    return
                t0 = time.time()
                try:
                    url, source = await fetch_logo(crawler, website)
                except Exception as e:
                    url, source = None, f"error: {e}"
                dt = time.time() - t0
                tag = source if url else "—"
                print(f"[{i+1}/{len(rows)}] {tag:<10} {name} ({dt:.1f}s)", file=sys.stderr, flush=True)
                results[i] = {"url": url or "", "source": source or ""}

        await asyncio.gather(*[process(i, r) for i, r in enumerate(rows)])

    fieldnames = list(rows[0].keys()) + ["Logo URL", "Logo Source"]
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row, res in zip(rows, results):
            row = dict(row)
            row["Logo URL"] = res["url"]
            row["Logo Source"] = res["source"]
            writer.writerow(row)

    from collections import Counter
    src_counts = Counter(r["source"] for r in results if r and r["url"])
    print(f"\nLogo sources: {dict(src_counts)}", file=sys.stderr)
    print(f"Output: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
