/**
 * P3.3 — Generate structured guide rows from how-to articles in
 * startup-utah-content. Mirrors enrich-new-resources.ts but:
 *   - target collection is `guides`, not `resources`
 *   - guide categories are a different closed enum (funding, networking,
 *     legal-ip, pitch, international-trade, idea-validation, media)
 *   - no community/industry/location facets
 *   - body is cleaned and stored verbatim (guides are the content)
 *
 * Deterministic fields (no LLM):
 *   - sourceUrl  = the startup.utah.gov frontmatter URL
 *   - sourceId   = "guide:<filename-stem>"
 *   - title      = frontmatter title
 *   - body       = cleaned markdown (stripped of WP scrape artifacts)
 *
 * LLM-generated fields (Haiku 4.5):
 *   - description  ≤600 chars, sentence-bounded
 *   - category     from GUIDE_CATEGORY_KEYS
 *   - tags, stageTags
 *
 * Output: data/guides-from-content.json (consumed by P3.3 importer).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

import { GUIDE_CATEGORY_KEYS } from '../lib/guides/categories';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const CONTENT = resolve(REPO_ROOT, 'startup-utah-content');
const OUT_JSON = resolve(REPO_ROOT, 'data', 'guides-from-content.json');

const MODEL_ID = 'anthropic/claude-haiku-4-5';

// 12 guide-shaped articles flagged in scripts/out/tier1-audit.json (is_guide_by_title)
// + Business Elevated Podcast (moved here from Phase 1 — media, not a program).
const GUIDE_PATHS: string[] = [
  'funding/crowdfunding-a-democratized-way-to-raise-capital.md',
  'funding/explore-grants-to-propel-your-business-forward.md',
  'funding/pitch-competitions-providing-funding-feedback-and-validation-for-utah-startups.md',
  'funding/prepare-your-utah-business-to-apply-for-up-to-200k-in-project-based-funding.md',
  'funding/small-business-funding-finding-the-best-option-for-your-needs.md',
  'resources/bolstering-your-business-with-intellectual-property.md',
  'resources/five-ways-to-build-a-strong-network-as-a-utah-entrepreneur.md',
  'resources/networking-how-events-bolster-your-business-and-grow-community.md',
  'resources/networking-what-local-coworking-spaces-are-offering-your-startup.md',
  'resources/ready-to-go-global-what-entrepreneurs-should-consider-about-international-expansion.md',
  'resources/six-things-to-include-in-your-pitch-deck.md',
  'resources/turning-your-passion-into-a-successful-business-idea.md',
  'resources/business-elevated-podcast-showcases-utahs-thriving-entrepreneurial-scene.md',
];

// --- Frontmatter + body parsing --------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
const SOURCE_LINE_RE = /^Source:\s*<https?:\/\/[^>]+>\s*\n/m;
const TRACKER_HOST = 'url9183.utah.gov';
const DISCLAIMER_RE = /\n\*\s*\*\s*\*\s*\n[\s\S]*?The information in this article is current[\s\S]*$/;
const CTA_RE = /\nLooking to support your small business in Utah\?[\s\S]*?(?=\n\*\s*\*\s*\*|$)/;
const WP_IMAGE_RE = /!\[[^\]]*\]\(https?:\/\/[^)]*wp-content\/uploads\/[^)]+\)\s*\n?/g;
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function parseMarkdown(absPath: string): { title: string; sourceUrl: string; body: string } {
  const raw = readFileSync(absPath, 'utf-8');
  const m = raw.match(FRONTMATTER_RE);
  if (!m) throw new Error(`No frontmatter in ${absPath}`);
  const fm = m[1] ?? '';
  const body = m[2] ?? '';
  const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
  const urlMatch = fm.match(/^url:\s*(\S+)\s*$/m);
  if (!titleMatch || !urlMatch) throw new Error(`No title/url in ${absPath}`);
  let title = titleMatch[1] ?? '';
  try {
    title = JSON.parse(`"${title.replace(/"/g, '\\"')}"`);
  } catch {
    /* leave */
  }
  return { title, sourceUrl: urlMatch[1] ?? '', body };
}

function cleanBody(raw: string, title: string): string {
  let body = raw;
  body = body.replace(`# ${title}\n`, '');
  body = body.replace(SOURCE_LINE_RE, '');
  body = body.replace(DISCLAIMER_RE, '');
  body = body.replace(CTA_RE, '');
  body = body.replace(WP_IMAGE_RE, '');
  body = body.replace(LINK_RE, (full, anchor: string, url: string) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes(TRACKER_HOST)) return anchor;
    } catch {
      /* leave */
    }
    return full;
  });
  body = body.replace(/\n{3,}/g, '\n\n');
  return body.trim() + '\n';
}

// --- LLM schema -------------------------------------------------------------

const EnrichmentSchema = z.object({
  description: z
    .string()
    .describe('Plain-prose summary, ≤600 chars when possible. Lead with what the guide teaches and who it serves.'),
  category: z.enum(GUIDE_CATEGORY_KEYS),
  tags: z.array(z.string()).describe('3 to 8 short keywords for search.'),
  stageTags: z
    .array(z.string())
    .describe('Lifecycle hints (e.g., "idea", "early-stage", "growth", "all-stages"). Free-form short labels.'),
});

type Enrichment = z.infer<typeof EnrichmentSchema>;

const CATEGORY_LIST = [...GUIDE_CATEGORY_KEYS].join(', ');

function buildPrompt(args: { title: string; body: string }): string {
  const body = args.body.slice(0, 8_000);
  return `You are enriching a guide (educational article) for the Utah Founder Guide.

Given the article below, extract structured metadata in the JSON shape requested.

CRITICAL VOCABULARY CONSTRAINTS:
  category ∈ {${CATEGORY_LIST}}

Rules:
  • description: ≤600 chars, plain prose. Lead with what the guide teaches and who'll benefit. State concrete tips, frameworks, or examples when present. No marketing fluff.
  • category: pick the single best fit.
  • tags: 3–8 short distinctive keywords for search (e.g., "pitch-deck", "investor-questions", "trademark-vs-copyright", "rural-grants").
  • stageTags: lifecycle hints — short labels like "idea", "validation", "early-stage", "growth", "all-stages". Pick 1–3.

Article:
TITLE: ${args.title}

${body}`;
}

// --- Main -------------------------------------------------------------------

type GeneratedGuide = {
  sourceId: string;
  title: string;
  description: string;
  body: string;
  sourceUrl: string;
  category: (typeof GUIDE_CATEGORY_KEYS)[number];
  tags: string[];
  stageTags: string[];
  _meta: { sourcePath: string };
};

function trimToBoundary(text: string, max: number): string {
  if (text.length <= max) return text.trim();
  const window = text.slice(0, max);
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = window[i + 1];
      if (next === undefined || /\s/.test(next)) return window.slice(0, i + 1).trim();
    }
  }
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

async function main() {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    console.error('OPENROUTER_API_KEY not set');
    process.exit(1);
  }

  const openrouter = createOpenRouter({
    apiKey: orKey,
    headers: {
      'HTTP-Referer': 'https://startup.utah.gov',
      'X-Title': 'Startup Utah - guides enrichment',
    },
  });

  console.log(`Enriching ${GUIDE_PATHS.length} guide articles via ${MODEL_ID}…\n`);

  const out: GeneratedGuide[] = [];
  let failed = 0;

  for (const rel of GUIDE_PATHS) {
    const absPath = resolve(CONTENT, rel);
    let parsed: { title: string; sourceUrl: string; body: string };
    try {
      parsed = parseMarkdown(absPath);
    } catch (err) {
      console.error(`  fail [parse]  ${rel} — ${(err as Error).message}`);
      failed++;
      continue;
    }
    const cleaned = cleanBody(parsed.body, parsed.title);

    let result: { object: Enrichment };
    try {
      result = await generateObject({
        model: openrouter.chat(MODEL_ID),
        schema: EnrichmentSchema,
        prompt: buildPrompt({ title: parsed.title, body: cleaned }),
        temperature: 0.2,
        maxOutputTokens: 600,
      });
    } catch (err) {
      console.error(`  fail [llm]    ${parsed.title} — ${(err as Error).message}`);
      failed++;
      continue;
    }

    const description = trimToBoundary(result.object.description, 600);
    const stem = rel.split('/').pop()!.replace(/\.md$/, '');
    const sourceId = `guide:${stem}`;
    const row: GeneratedGuide = {
      sourceId,
      title: parsed.title,
      description,
      body: cleaned,
      sourceUrl: parsed.sourceUrl,
      category: result.object.category,
      tags: result.object.tags,
      stageTags: result.object.stageTags,
      _meta: { sourcePath: `startup-utah-content/${rel}` },
    };
    out.push(row);
    console.log(
      `  ok            ${parsed.title.slice(0, 60)}  →  ${row.category}  (${row.tags.length}t/${row.stageTags.length}s)`,
    );
  }

  mkdirSync(dirname(OUT_JSON), { recursive: true });
  writeFileSync(OUT_JSON, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');

  console.log('\n────────── enrichment summary ──────────');
  console.log(`  ok:     ${out.length}`);
  console.log(`  failed: ${failed}`);
  console.log(`  output: ${OUT_JSON}`);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
