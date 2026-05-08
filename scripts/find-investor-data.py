#!/usr/bin/env python3
"""Extract investor-relevant company metadata from each company's website.

For each company:
  1. Crawl key pages (homepage + /about, /team, /careers, /pricing, /customers)
     via crawl4ai, concat into one markdown blob, truncate to a token-safe size.
  2. Send to Claude Haiku 4.5 via the JobNimbus AI gateway (Portkey → Bedrock,
     OpenAI Chat Completions format) with a forced tool call to a structured
     schema designed for investor triage.
  3. For free-form fields, the model returns a verbatim `sourceQuote` next to
     the value. We post-validate that each quote is a substring of the source
     markdown (cleaned of bold/italic markers); rows where it isn't get a
     `Hallucination Flags` column listing the suspect fields.
  4. Write everything to a CSV — list/object fields are JSON-encoded.

Cost (~220 companies, Haiku 4.5 via Bedrock): ~$0.30–1.00.
"""
import argparse
import asyncio
import csv
import json
import os
import re
import sys
import time
from urllib.parse import urljoin

from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(".env.local")

INPUT_CSV = "Map Data for Builder Day - with-logos.csv"
OUTPUT_CSV = "Map Data for Builder Day - with-investor-data.csv"

CANDIDATE_PATHS = [
    "",  # homepage
    "/about",
    "/about-us",
    "/company",
    "/team",
    "/our-team",
    "/careers",
    "/jobs",
    "/pricing",
    "/customers",
    "/case-studies",
]
PER_PAGE_TOKEN_BUDGET = 1500  # rough word count cap per page
TOTAL_TOKEN_BUDGET = 6000     # rough word count cap across all pages

SYSTEM_PROMPT = """You are a research analyst preparing a deal-flow brief for a venture investor.
You will be given a company name and the concatenated markdown of their public website
pages. Extract the structured fields requested by the tool, calibrated for investor triage.

Critical rules:
- If a field is not clearly stated or strongly implied by the markdown, OMIT it
  (do not guess, do not infer, do not fabricate). Empty/missing > wrong.
- For free-form fields (pitch, differentiationClaim, founders.priorCompanies,
  funding.*, keyMetrics.*), provide a verbatim `sourceQuote` from the markdown
  proving the claim. The quote must appear word-for-word in the input.
- `pitch` is YOUR one-sentence summary of what the company does — not their
  marketing tagline. Be concrete: who buys it and what problem does it solve.
- For `targetMarket` and `monetizationModel`, only choose a value if the
  markdown gives strong evidence; otherwise omit.
- Never invent founder names, customer names, or funding numbers. If a "trusted
  by" section lists logos but you can't read the names, leave notableCustomers empty.
"""


TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "record_company_profile",
        "description": "Record investor-relevant facts extracted from the company's website.",
        "parameters": {
            "type": "object",
            "properties": {
                "pitch": {
                    "type": "string",
                    "description": "One-sentence summary in YOUR voice: who buys this and what problem it solves. Concrete, not marketing copy.",
                },
                "productCategory": {
                    "type": "string",
                    "description": "Specific category, e.g. 'vertical SaaS for roofing contractors', 'AI agent dev tools', 'B2B fintech for SMB lending'.",
                },
                "targetMarket": {
                    "type": "string",
                    "enum": ["enterprise", "mid-market", "smb", "consumer", "developer", "prosumer"],
                    "description": "Only set if the markdown clearly indicates the target. Omit if ambiguous.",
                },
                "monetizationModel": {
                    "type": "string",
                    "enum": ["subscription", "usage-based", "marketplace", "transactional", "freemium", "contact-sales", "ads"],
                    "description": "Only set if a pricing page or call-to-action makes it clear. Omit if ambiguous.",
                },
                "founders": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "title": {"type": "string"},
                            "priorCompanies": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Notable previous employers/companies, e.g. ['Stripe', 'Google'].",
                            },
                            "sourceQuote": {"type": "string", "description": "Verbatim quote from markdown."},
                        },
                        "required": ["name"],
                    },
                    "description": "Founders/co-founders only. Skip non-founder execs.",
                },
                "notableCustomers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Companies named in 'trusted by' / customer-logos / case-study sections. Names only — skip if you can only see logos without text.",
                },
                "funding": {
                    "type": "object",
                    "properties": {
                        "round": {"type": "string", "description": "e.g. 'Pre-seed', 'Seed', 'Series A'"},
                        "amountUsd": {"type": "number", "description": "Total dollars raised in this round (or to date if cumulative)."},
                        "leadInvestor": {"type": "string"},
                        "sourceQuote": {"type": "string"},
                    },
                },
                "openRoleCount": {
                    "type": "integer",
                    "description": "Number of open positions visible on the careers page. 0 if a careers page is present but empty. Omit if no careers page was crawled.",
                },
                "differentiationClaim": {
                    "type": "object",
                    "properties": {
                        "claim": {"type": "string", "description": "Their stated moat / unique angle in your words."},
                        "sourceQuote": {"type": "string"},
                    },
                },
                "keyMetrics": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "metric": {"type": "string", "description": "e.g. 'customers', 'ARR', 'users', 'transactions/yr'"},
                            "value": {"type": "string", "description": "e.g. '50+ enterprise', '$2M', '10K monthly'"},
                            "sourceQuote": {"type": "string"},
                        },
                        "required": ["metric", "value", "sourceQuote"],
                    },
                },
                "integrations": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Named third-party platforms they integrate with (Salesforce, Slack, Stripe, etc.). Distribution-relevant for B2B.",
                },
            },
            "required": ["pitch", "productCategory"],
        },
    },
}


def normalize_url(url: str) -> str | None:
    if not url:
        return None
    url = url.strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url


def truncate_words(text: str, max_words: int) -> str:
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]) + " […truncated]"


async def crawl_company_pages(crawler, website: str) -> tuple[str, list[str]]:
    """Crawl up to ~5 useful pages and concat into one markdown doc.

    Returns (combined_markdown, urls_actually_fetched).
    """
    base = normalize_url(website)
    if not base:
        return "", []
    config = CrawlerRunConfig(
        cache_mode=CacheMode.ENABLED,
        page_timeout=12000,
        word_count_threshold=20,
        verbose=False,
    )
    sections: list[str] = []
    urls_used: list[str] = []
    seen_content_hashes: set[int] = set()

    for path in CANDIDATE_PATHS:
        if sum(len(s.split()) for s in sections) >= TOTAL_TOKEN_BUDGET:
            break
        url = urljoin(base + "/", path.lstrip("/")) if path else base
        try:
            result = await crawler.arun(url=url, config=config)
        except Exception:
            continue
        if not result.success or not result.markdown:
            continue
        md = str(result.markdown).strip()
        if not md or "404" in md[:200].lower() and "not found" in md[:300].lower():
            continue
        # Cheap dedupe: skip identical-content pages
        h = hash(md[:500])
        if h in seen_content_hashes:
            continue
        seen_content_hashes.add(h)
        sections.append(f"=== {url} ===\n{truncate_words(md, PER_PAGE_TOKEN_BUDGET)}")
        urls_used.append(url)

    combined = "\n\n".join(sections)
    if len(combined.split()) > TOTAL_TOKEN_BUDGET:
        combined = truncate_words(combined, TOTAL_TOKEN_BUDGET)
    return combined, urls_used


def clean_md(text: str) -> str:
    return re.sub(r"[*_`]+", "", text or "")


def validate_quotes(profile: dict, source_md: str) -> list[str]:
    """Return a list of field paths whose sourceQuote isn't in the source markdown.

    Quotes are matched against the cleaned (markdown-stripped) source. We
    normalize whitespace on both sides because LLMs sometimes collapse or
    normalize spaces in quoted text.
    """
    flagged: list[str] = []
    cleaned = re.sub(r"\s+", " ", clean_md(source_md)).lower()

    def check(quote: str | None, field: str):
        if not quote:
            return
        norm = re.sub(r"\s+", " ", clean_md(quote)).strip().lower()
        if len(norm) < 10:  # too short to validate meaningfully
            return
        if norm not in cleaned:
            flagged.append(field)

    if isinstance(profile.get("differentiationClaim"), dict):
        check(profile["differentiationClaim"].get("sourceQuote"), "differentiationClaim")
    if isinstance(profile.get("funding"), dict):
        check(profile["funding"].get("sourceQuote"), "funding")
    for i, f in enumerate(profile.get("founders") or []):
        if isinstance(f, dict):
            check(f.get("sourceQuote"), f"founders[{i}]")
    for i, m in enumerate(profile.get("keyMetrics") or []):
        if isinstance(m, dict):
            check(m.get("sourceQuote"), f"keyMetrics[{i}]")
    return flagged


def make_client() -> OpenAI:
    return OpenAI(
        api_key="placeholder",
        base_url=os.environ["AI_GATEWAY_BASE_URL"],
        default_headers={
            "x-portkey-api-key": os.environ["AI_GATEWAY_API_KEY"],
            "x-portkey-provider": "@bedrock",
        },
    )


def extract_with_llm(client: OpenAI, name: str, markdown: str) -> dict | None:
    if not markdown.strip():
        return None
    user_msg = (
        f"Company: {name}\n\nWebsite markdown follows. Extract per the tool schema, "
        f"using only what's present.\n\n---\n{markdown}\n---"
    )
    try:
        r = client.chat.completions.create(
            model=os.environ["AI_GATEWAY_HAIKU_MODEL"],
            max_tokens=2048,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            tools=[TOOL_SCHEMA],
            tool_choice={"type": "function", "function": {"name": "record_company_profile"}},
        )
    except Exception as e:
        print(f"   ! LLM error: {e}", file=sys.stderr)
        return None
    tc = r.choices[0].message.tool_calls
    if not tc:
        return None
    try:
        return json.loads(tc[0].function.arguments)
    except json.JSONDecodeError:
        return None


def to_csv_value(v):
    if v is None:
        return ""
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return str(v)


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--input", default=INPUT_CSV)
    parser.add_argument("--output", default=OUTPUT_CSV)
    parser.add_argument("--only", help="Comma-sep list of company names to process (skip others)")
    args = parser.parse_args()

    if not os.environ.get("AI_GATEWAY_API_KEY"):
        print("AI_GATEWAY_API_KEY missing from env (.env.local).", file=sys.stderr)
        sys.exit(1)

    only = set(s.strip() for s in args.only.split(",")) if args.only else None

    with open(args.input, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if args.limit:
        rows = rows[: args.limit]
    print(f"Processing {len(rows)} rows (concurrency={args.concurrency})", file=sys.stderr)

    client = make_client()
    sem = asyncio.Semaphore(args.concurrency)
    results: list[dict] = [{} for _ in rows]

    def write_csv():
        """Persist results to disk. Called inside the crawler context to
        survive any hang during AsyncWebCrawler.__aexit__ teardown.
        Idempotent — safe to call mid-run for incremental checkpoints."""
        base_fields = list(rows[0].keys())
        extra_fields = [
            "Pitch", "Product Category", "Target Market", "Monetization Model",
            "Founders", "Notable Customers", "Funding", "Open Role Count",
            "Differentiation Claim", "Key Metrics", "Integrations",
            "Pages Crawled", "Hallucination Flags",
        ]
        fieldnames = base_fields + extra_fields
        with open(args.output, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for row, res in zip(rows, results):
                row = dict(row)
                p = (res or {}).get("profile") or {}
                row["Pitch"] = to_csv_value(p.get("pitch"))
                row["Product Category"] = to_csv_value(p.get("productCategory"))
                row["Target Market"] = to_csv_value(p.get("targetMarket"))
                row["Monetization Model"] = to_csv_value(p.get("monetizationModel"))
                row["Founders"] = to_csv_value(p.get("founders"))
                row["Notable Customers"] = to_csv_value(p.get("notableCustomers"))
                row["Funding"] = to_csv_value(p.get("funding"))
                row["Open Role Count"] = to_csv_value(p.get("openRoleCount"))
                row["Differentiation Claim"] = to_csv_value(p.get("differentiationClaim"))
                row["Key Metrics"] = to_csv_value(p.get("keyMetrics"))
                row["Integrations"] = to_csv_value(p.get("integrations"))
                row["Pages Crawled"] = to_csv_value((res or {}).get("pages"))
                row["Hallucination Flags"] = to_csv_value((res or {}).get("flags"))
                writer.writerow(row)

    async with AsyncWebCrawler() as crawler:
        async def process(i: int, row: dict):
            async with sem:
                name = row["Startup Name "].strip()
                website = row["Website"].strip()
                if not name or (only and name not in only):
                    return
                t0 = time.time()
                try:
                    md, urls = await crawl_company_pages(crawler, website)
                    if not md:
                        print(f"[{i+1}/{len(rows)}] —    {name} (no markdown)", file=sys.stderr)
                        results[i] = {"name": name, "pages": [], "profile": None, "flags": []}
                        return
                    profile = await asyncio.get_event_loop().run_in_executor(
                        None, extract_with_llm, client, name, md
                    )
                    flags = validate_quotes(profile, md) if profile else []
                except Exception as e:
                    print(f"[{i+1}/{len(rows)}] ✗    {name} — {type(e).__name__}: {e}", file=sys.stderr)
                    results[i] = {"name": name, "pages": [], "profile": None, "flags": [], "error": str(e)}
                    return
                dt = time.time() - t0
                tag = "✓" if profile else "—"
                flag_str = f" ⚠{len(flags)}" if flags else ""
                print(
                    f"[{i+1}/{len(rows)}] {tag}{flag_str} {name} ({dt:.1f}s, {len(urls)}p)",
                    file=sys.stderr, flush=True,
                )
                results[i] = {"name": name, "pages": urls, "profile": profile, "flags": flags}

        await asyncio.gather(*[process(i, r) for i, r in enumerate(rows)], return_exceptions=False)
        # Write inside the context so a hang in __aexit__ doesn't strand results
        write_csv()

    extracted = sum(1 for r in results if r and r.get("profile"))
    flagged = sum(1 for r in results if r and r.get("flags"))
    print(f"\nExtracted profiles: {extracted}/{len(results)}", file=sys.stderr)
    print(f"Rows with hallucination flags: {flagged}", file=sys.stderr)
    print(f"Output: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
