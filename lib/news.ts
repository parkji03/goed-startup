/**
 * newsdata.io free-tier client. Fields like `content`, `sentiment`, and the
 * `ai_*` family come back as the literal string "ONLY AVAILABLE IN PAID
 * PLANS", so we project to a narrow shape and drop them entirely.
 *
 * Syndication is the elephant: a single press release shows up under 10+
 * sources with subtly reworded titles. We dedupe on (a) identical
 * `image_url` and (b) Jaccard token similarity ≥ 0.6 over normalized titles.
 */

const ENDPOINT = "https://newsdata.io/api/1/latest";
const QUERY = 'Utah AND (startup OR "funding round" OR "venture capital" OR investor)';
const DEDUPE_JACCARD_THRESHOLD = 0.6;

export type NewsArticle = {
  id: string;
  title: string;
  description: string | null;
  link: string;
  pubDate: string;
  sourceId: string;
  sourceName: string;
  sourceIcon: string | null;
  imageUrl: string | null;
  creators: string[];
  category: string | null;
};

type RawArticle = {
  article_id: string;
  link: string;
  title: string;
  description: string | null;
  pubDate: string;
  image_url: string | null;
  source_id: string;
  source_name: string;
  source_icon: string | null;
  keywords: string[] | null;
  creator: string[] | null;
  category: string[] | null;
};

type RawResponse = {
  status: string;
  results?: RawArticle[];
};

export async function fetchUtahNews(): Promise<NewsArticle[]> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) throw new Error("NEWSDATA_API_KEY is not set");

  const url = new URL(ENDPOINT);
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("q", QUERY);

  const res = await fetch(url, { next: { revalidate: 43200 } });
  if (!res.ok) throw new Error(`newsdata.io ${res.status} ${res.statusText}`);

  const data = (await res.json()) as RawResponse;
  if (data.status !== "success" || !data.results) return [];

  return dedupe(data.results.map(normalize));
}

function normalize(raw: RawArticle): NewsArticle {
  return {
    id: raw.article_id,
    title: decodeEntities(raw.title),
    description: raw.description ? decodeEntities(raw.description) : null,
    link: raw.link,
    pubDate: raw.pubDate,
    sourceId: raw.source_id,
    sourceName: raw.source_name,
    sourceIcon: raw.source_icon,
    imageUrl: raw.image_url,
    creators: raw.creator ?? [],
    category: raw.category?.[0] ?? null,
  };
}

/**
 * newsdata.io emits HTML entities (`&#x27;`, `&amp;`) in titles/descriptions,
 * which would otherwise render literally in JSX. Handle the common cases —
 * full HTML decoding is overkill here.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Strip site suffix (" - Forbes", " | Reuters"), collapse whitespace, lower.
 * Tokenize to a set of words ≥ 3 chars to drop noise like "the/and/of".
 */
function tokenize(title: string): Set<string> {
  const stripped = title
    .replace(/\s+[-|–—:]\s+[^-|–—:]+$/u, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(stripped.split(" ").filter((t) => t.length >= 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Keep first occurrence (results come ordered by recency). Drop later ones
 * that share an `image_url` or whose title tokens overlap above the
 * threshold — both are strong syndication signals.
 */
function dedupe(articles: NewsArticle[]): NewsArticle[] {
  const kept: Array<{ article: NewsArticle; tokens: Set<string> }> = [];
  const seenImages = new Set<string>();

  for (const article of articles) {
    if (article.imageUrl && seenImages.has(article.imageUrl)) continue;
    const tokens = tokenize(article.title);
    const isDup = kept.some(({ tokens: prior }) => jaccard(tokens, prior) >= DEDUPE_JACCARD_THRESHOLD);
    if (isDup) continue;

    kept.push({ article, tokens });
    if (article.imageUrl) seenImages.add(article.imageUrl);
  }

  return kept.map(({ article }) => article);
}
