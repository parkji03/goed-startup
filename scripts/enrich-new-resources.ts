/**
 * P1.1 — Generate structured resource rows for the truly-missing programs
 * identified by scripts/verify-new-programs.py.
 *
 * Deterministic fields (no LLM):
 *   - url        = audit's primary_external_url (program homepage)
 *   - sourceId   = "content:<filename-stem>" — stable + re-importable
 *   - title      = frontmatter title (cleaned)
 *
 * LLM-generated fields (Haiku 4.5 via OpenRouter, generateObject):
 *   - description (≤600 chars)
 *   - category (literal union, validated by Zod enum)
 *   - communities / industries / locations / tags
 *
 * Vocabulary discipline:
 *   - Communities/Industries/Locations are clamped against the canonical sets
 *     in convex/lib/facetVocabularies.ts BEFORE writing JSON. The Convex
 *     mutation also clamps at write time (P0.2), but we do it here too so the
 *     reviewable JSON file is already clean.
 *
 * Output: data/resources-from-content.json — one entry per generated row,
 * ready for the P1.3 importer.
 *
 * Usage:
 *   OPENROUTER_API_KEY=... pnpm exec tsx scripts/enrich-new-resources.ts
 *   (or: node --env-file=.env.local --import tsx scripts/enrich-new-resources.ts)
 *
 * Re-run is safe — output is fully regenerated.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

import {
  COMMUNITY_VOCAB,
  INDUSTRY_VOCAB,
  LOCATION_VOCAB,
  clampToVocab,
} from '../convex/lib/facetVocabularies';
import { RESOURCE_CATEGORY_KEYS } from '../lib/resources/categories';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const MISSING_JSON = resolve(REPO_ROOT, 'scripts', 'out', 'missing-programs.json');
const OUT_JSON = resolve(REPO_ROOT, 'data', 'resources-from-content.json');

const MODEL_ID = 'anthropic/claude-haiku-4-5';

// --- Triage rules -----------------------------------------------------------

/**
 * Skip candidates that the verifier surfaced as 'missing' but which clearly
 * aren't program profiles. Keeps reviewable output focused on real candidates.
 */
const SKIP_STEMS = new Set([
  // Guide-shaped article with no primary URL.
  'helping-utah-startups-thrive-the-power-of-incubators-and-accelerators',
  // News article reporting past competition winners — the program (Morgan
  // Stanley Multicultural Innovation Lab) isn't really a Utah-state resource
  // and the article is winners-focused, not program-focused.
  'two-utah-startups-named-winners-in-morgan-stanleys-pitch-competition',
  // Out-of-state event, not a Utah ecosystem program. Annual one-day pitch
  // competition at Walmart HQ in Bentonville. Belongs on an events surface
  // if anywhere — not in the resources catalog.
  'utah-startups-apply-now-for-walmarts-open-call-pitch-competition',
]);

/**
 * Optional sub-program merges — when the markdown profiles a sub-program of
 * an org we've already decided to include as a single row, keep only the
 * canonical row and drop the sub-program's redundant generation.
 *
 * Empty for now; the only candidate (iHub ASE under iHub) was already filtered
 * out as EXISTS by the verifier. Keeping the structure here in case future
 * content adds new sub-programs.
 */
const MERGE_INTO: Record<string, string> = {};

// --- Frontmatter parser -----------------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

function parseMarkdown(path: string): { title: string; body: string } {
  const raw = readFileSync(path, 'utf-8');
  const m = raw.match(FRONTMATTER_RE);
  if (!m) throw new Error(`No frontmatter in ${path}`);
  const fm = m[1] ?? '';
  const body = m[2] ?? '';
  const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
  if (!titleMatch) throw new Error(`No title in ${path}`);
  // Decode any unicode escapes the scrape left in (e.g. ’).
  let title = titleMatch[1] ?? '';
  try {
    title = JSON.parse(`"${title.replace(/"/g, '\\"')}"`);
  } catch {
    /* leave as-is */
  }
  return { title, body };
}

// --- LLM schema -------------------------------------------------------------

// Schema constraints intentionally minimal: OpenRouter routes through providers
// (e.g., Bedrock) that reject JSON-Schema array-min/max > 1. Prompt enforces ranges.
const EnrichmentSchema = z.object({
  description: z
    .string()
    .describe(
      'Plain-prose summary, ≤600 chars when possible. Lead with what the program does and who it serves. Include eligibility, dollar amounts, or scope when stated.',
    ),
  category: z.enum(RESOURCE_CATEGORY_KEYS),
  communities: z
    .array(z.string())
    .describe('Only list communities the program explicitly serves. Use ["Any"] for general-purpose.'),
  industries: z
    .array(z.string())
    .describe('Only list industries the program targets. List all 10 for general-purpose programs.'),
  locations: z
    .array(z.string())
    .describe('Utah counties. List all 29 for statewide programs; otherwise specific counties.'),
  tags: z
    .array(z.string())
    .describe('3 to 8 free-form short keywords for search (e.g., "biotech", "wet-lab", "pre-seed", "rural-grant").'),
});

type Enrichment = z.infer<typeof EnrichmentSchema>;

// --- Prompt -----------------------------------------------------------------

const COMMUNITY_LIST = [...COMMUNITY_VOCAB].join(', ');
const INDUSTRY_LIST = [...INDUSTRY_VOCAB].join(', ');
const LOCATION_LIST = [...LOCATION_VOCAB].join(', ');
const CATEGORY_LIST = [...RESOURCE_CATEGORY_KEYS].join(', ');

function buildPrompt(args: { title: string; url: string; body: string }): string {
  // Trim body to keep prompt size bounded; the audits show bodies are 2k–7k chars.
  const body = args.body.slice(0, 8_000);
  return `You are enriching a structured resource record for the Utah Founder Guide.

You will be given a published article about a Utah startup-ecosystem program. Extract structured metadata in the JSON shape requested by the tool.

CRITICAL VOCABULARY CONSTRAINTS — values must match exactly:
  communities ∈ {${COMMUNITY_LIST}}
  industries  ∈ {${INDUSTRY_LIST}}
  locations   ∈ {${LOCATION_LIST}}
  category    ∈ {${CATEGORY_LIST}}

Rules:
  • description: ≤600 chars, plain prose. Lead with what the program does and who it serves. State eligibility, dollar amounts, or scope when mentioned. No marketing fluff. Do NOT include year-specific deadlines (e.g., "Apply by July 25, 2025") — articles may be stale; if a recurring program has cyclical applications, write "Application windows open annually — check the official site for the current cycle." instead.
  • communities: Only list communities the program explicitly serves (e.g., Rural, Veteran). For general-purpose programs, return ["Any"].
  • industries: For industry-specific programs (e.g., biotech-only), list only those. For general-purpose programs, list ALL 10 industries (matching the existing CSV pattern).
  • locations: For statewide programs, list ALL 29 counties. For region-specific programs (e.g., southern Utah only), list the relevant counties.
  • category: Pick the single best-fit category.
  • tags: 3–8 short distinctive keywords for search (e.g., "wet-lab", "sbir-bridge", "pre-seed", "rural-grant", "regulatory-sandbox").

Article:
TITLE: ${args.title}
PROGRAM URL: ${args.url}

${body}`;
}

// --- Description trim -------------------------------------------------------

/**
 * Trim to ≤max chars at a sentence boundary (`.`/`!`/`?` followed by space or
 * end-of-string). Falls back to the last word boundary if no sentence ends
 * within the window. Returns the input as-is if it's already short enough.
 */
function trimToBoundary(text: string, max: number): string {
  if (text.length <= max) return text.trim();
  const window = text.slice(0, max);
  // Find the last sentence-ending punctuation followed by whitespace/end.
  // (Avoids the /s flag — pre-ES2018.)
  let lastEnd = -1;
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = window[i + 1];
      if (next === undefined || /\s/.test(next)) {
        lastEnd = i;
        break;
      }
    }
  }
  if (lastEnd >= 0) return window.slice(0, lastEnd + 1).trim();
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

// --- Main -------------------------------------------------------------------

type MissingEntry = {
  stem: string;
  title: string;
  primary_url: string;
  path: string;
};

type MissingFile = {
  missing: MissingEntry[];
  maybe: unknown[];
  exists: unknown[];
};

type GeneratedRow = {
  sourceId: string;
  title: string;
  description: string;
  url: string;
  category: (typeof RESOURCE_CATEGORY_KEYS)[number];
  communitiesRaw: string;
  industriesRaw: string;
  locationsRaw: string;
  tagsRaw: string;
  // Provenance — useful during P1.2 review, ignored by the importer.
  _meta: {
    sourcePath: string;
    droppedFacets?: { communities?: string[]; industries?: string[]; locations?: string[] };
  };
};

async function main() {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    console.error('OPENROUTER_API_KEY not set in environment');
    process.exit(1);
  }
  if (!existsSync(MISSING_JSON)) {
    console.error(
      `Missing ${MISSING_JSON}. Run scripts/verify-new-programs.py first to generate it.`,
    );
    process.exit(2);
  }

  const missing: MissingFile = JSON.parse(readFileSync(MISSING_JSON, 'utf-8'));
  const queue = missing.missing.filter((m) => {
    if (SKIP_STEMS.has(m.stem)) {
      console.log(`  skip [triage]   ${m.title}`);
      return false;
    }
    if (!m.primary_url) {
      console.log(`  skip [no url]   ${m.title}`);
      return false;
    }
    if (MERGE_INTO[m.stem]) {
      console.log(`  skip [merge]    ${m.title} (subsumed by ${MERGE_INTO[m.stem]})`);
      return false;
    }
    return true;
  });

  console.log(`\nEnriching ${queue.length} of ${missing.missing.length} missing programs via ${MODEL_ID}…\n`);

  const openrouter = createOpenRouter({
    apiKey: orKey,
    headers: {
      'HTTP-Referer': 'https://startup.utah.gov',
      'X-Title': 'Startup Utah - content enrichment',
    },
  });

  const generated: GeneratedRow[] = [];
  let failed = 0;

  for (const entry of queue) {
    const fullPath = resolve(REPO_ROOT, entry.path);
    let parsed: { title: string; body: string };
    try {
      parsed = parseMarkdown(fullPath);
    } catch (err) {
      console.error(`  fail [parse]    ${entry.title} — ${(err as Error).message}`);
      failed++;
      continue;
    }

    const prompt = buildPrompt({
      title: parsed.title,
      url: entry.primary_url,
      body: parsed.body,
    });

    let result: { object: Enrichment };
    try {
      result = await generateObject({
        model: openrouter.chat(MODEL_ID),
        schema: EnrichmentSchema,
        prompt,
        temperature: 0.2,
        maxOutputTokens: 800,
      });
    } catch (err) {
      console.error(`  fail [llm]      ${entry.title} — ${(err as Error).message}`);
      failed++;
      continue;
    }

    // Code-side vocabulary clamp + diff for provenance.
    const communities = clampToVocab(result.object.communities, COMMUNITY_VOCAB, 'communities');
    const industries = clampToVocab(result.object.industries, INDUSTRY_VOCAB, 'industries');
    const locations = clampToVocab(result.object.locations, LOCATION_VOCAB, 'locations');

    const droppedCommunities = result.object.communities.filter((v) => !COMMUNITY_VOCAB.has(v.trim()));
    const droppedIndustries = result.object.industries.filter((v) => !INDUSTRY_VOCAB.has(v.trim()));
    const droppedLocations = result.object.locations.filter((v) => !LOCATION_VOCAB.has(v.trim()));

    // Trim description to 600 chars at the last sentence boundary so we don't
    // cut off mid-word. If no sentence-ending punctuation appears in the
    // window, fall back to the last word boundary.
    const description = trimToBoundary(result.object.description, 600);

    const sourceId = `content:${entry.stem}`;
    const row: GeneratedRow = {
      sourceId,
      title: parsed.title,
      description,
      url: entry.primary_url,
      category: result.object.category,
      communitiesRaw: communities.join('|'),
      industriesRaw: industries.join('|'),
      locationsRaw: locations.join('|'),
      tagsRaw: result.object.tags.join('|'),
      _meta: {
        sourcePath: entry.path,
        ...(droppedCommunities.length || droppedIndustries.length || droppedLocations.length
          ? {
              droppedFacets: {
                ...(droppedCommunities.length ? { communities: droppedCommunities } : {}),
                ...(droppedIndustries.length ? { industries: droppedIndustries } : {}),
                ...(droppedLocations.length ? { locations: droppedLocations } : {}),
              },
            }
          : {}),
      },
    };

    generated.push(row);
    console.log(
      `  ok            ${parsed.title.slice(0, 60)}  →  ${row.category}  (${communities.length}c/${industries.length}i/${locations.length}l/${result.object.tags.length}t)`,
    );
  }

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(generated, null, 2)}\n`, 'utf-8');

  console.log('\n────────── enrichment summary ──────────');
  console.log(`  ok:     ${generated.length}`);
  console.log(`  failed: ${failed}`);
  console.log(`  output: ${OUT_JSON}`);
  console.log('\nNext: review the JSON by hand (P1.2), then run the importer (P1.3).');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
