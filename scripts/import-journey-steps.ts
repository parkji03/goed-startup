/**
 * P3.4 — Import the 19 founder-journey step pages into the `guides` table.
 *
 * No LLM needed: the pages have stable structure. Step number comes from the
 * title pattern ("Step N: ..."). Lifecycle stage tags come from the
 * entrepreneur-journey.md ordering (idea → start → grow → exit).
 *
 * Usage:
 *   pnpm import:journey-steps
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const CONTENT = resolve(REPO_ROOT, 'startup-utah-content');

// Order matches entrepreneur-journey.md exactly.
const STEPS: Array<{
  step: number;
  file: string;
  stageTags: string[];
  tags: string[];
}> = [
  { step: 1, file: 'find-idea.md', stageTags: ['idea'], tags: ['brainstorming', 'ideation'] },
  { step: 2, file: 'business-skills.md', stageTags: ['idea'], tags: ['business-skills', 'education'] },
  { step: 3, file: 'business-validation.md', stageTags: ['validation', 'early-stage'], tags: ['customer-discovery', 'market-research'] },
  { step: 4, file: 'build-product.md', stageTags: ['early-stage'], tags: ['product-development', 'prototyping'] },
  { step: 5, file: 'develop-brand.md', stageTags: ['early-stage'], tags: ['branding', 'marketing'] },
  { step: 6, file: 'business-plan-step.md', stageTags: ['early-stage'], tags: ['business-plan', 'strategy'] },
  { step: 7, file: 'registration.md', stageTags: ['early-stage'], tags: ['registration', 'licensure', 'legal'] },
  { step: 8, file: 'business-operations.md', stageTags: ['early-stage'], tags: ['operations', 'hr', 'payroll'] },
  { step: 9, file: 'fund-small-business.md', stageTags: ['early-stage', 'growth'], tags: ['funding', 'loans', 'grants'] },
  { step: 10, file: 'find-space.md', stageTags: ['early-stage'], tags: ['office-space', 'coworking'] },
  { step: 11, file: 'pay-taxes.md', stageTags: ['early-stage', 'all-stages'], tags: ['taxes', 'compliance'] },
  { step: 12, file: 'join-community.md', stageTags: ['growth', 'all-stages'], tags: ['community', 'networking'] },
  { step: 13, file: 'growth-funding.md', stageTags: ['growth'], tags: ['growth-funding', 'venture-capital'] },
  { step: 14, file: 'strategic-planning.md', stageTags: ['growth'], tags: ['strategic-planning'] },
  { step: 15, file: 'workforce.md', stageTags: ['growth'], tags: ['workforce', 'hiring', 'talent'] },
  { step: 16, file: 'government-contracts-2.md', stageTags: ['growth'], tags: ['government-contracts'] },
  { step: 17, file: 'international-trade-2.md', stageTags: ['growth'], tags: ['international-trade', 'export'] },
  { step: 18, file: 'relocate-business.md', stageTags: ['growth'], tags: ['relocation'] },
  { step: 19, file: 'close-business.md', stageTags: ['exit'], tags: ['exit', 'close-business'] },
];

// --- Body cleaning for journey-step pages -----------------------------------
// Beyond the standard rules, journey pages have repetitive nav chrome that
// adds no value to the agent or the detail page.

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;

const CHROME_PATTERNS: RegExp[] = [
  /^Source: <https?:\/\/[^>]+>\s*$/m,
  /^\/ start something here \/\s*$/m,
  /^# THINKING OF STARTING MY BUSINESS\s*$/m,
  /^# Start my business\s*$/m,
  /^# Grow my business\s*$/m,
  /^# Sell or Exit My Business\s*$/m,
  /^!\[Startup State logo white\][^\n]*$/m,
  /^!\[[^\]]*icon[^\]]*\]\([^)]+\)\s*$/m,
  /^Step \d+\s*$/m,
  /^__\s*$/m,
  /^Go to Step\.\.\.\s*$/m,
  /^\[ Return to Startup Journey\][^\n]*$/m,
  /^\[Full Resource List\][^\n]*$/m,
];
const WP_IMAGE_RE = /!\[[^\]]*\]\(https?:\/\/[^)]*wp-content\/uploads\/[^)]+\)\s*\n?/g;
const TRACKER_LINK_RE = /\[([^\]]+)\]\(https?:\/\/url9183\.utah\.gov\/[^)]+\)/g;

function parseMarkdown(absPath: string): { title: string; sourceUrl: string; body: string } {
  const raw = readFileSync(absPath, 'utf-8');
  const m = raw.match(FRONTMATTER_RE);
  if (!m) throw new Error(`No frontmatter in ${absPath}`);
  const fm = m[1] ?? '';
  const body = m[2] ?? '';
  const titleMatch = fm.match(/^title:\s*"?(.+?)"?\s*$/m);
  const urlMatch = fm.match(/^url:\s*(\S+)\s*$/m);
  if (!titleMatch || !urlMatch) throw new Error(`No title/url in ${absPath}`);
  return { title: titleMatch[1] ?? '', sourceUrl: urlMatch[1] ?? '', body };
}

function cleanJourneyBody(raw: string, title: string): string {
  let body = raw;

  // Strip the literal "# Step N: <Name>" h1 (matches frontmatter title).
  body = body.replace(`# ${title}\n`, '');

  // The pages also embed "# <Name>", "## <Name>", and the all-caps "## <NAME>"
  // variants of the same title. Strip each.
  const nameOnly = title.replace(/^Step \d+:\s*/, '').trim();
  if (nameOnly) {
    const escaped = nameOnly.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const variants = new Set([nameOnly, nameOnly.toUpperCase()]);
    for (const variant of variants) {
      const v = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      body = body.replace(new RegExp(`^#{1,3} ${v}\\s*$`, 'gm'), '');
    }
    // Also handle the bare nameOnly with original casing.
    body = body.replace(new RegExp(`^#{1,3} ${escaped}\\s*$`, 'gm'), '');
  }

  for (const pat of CHROME_PATTERNS) body = body.replace(pat, '');
  body = body.replace(WP_IMAGE_RE, '');
  body = body.replace(TRACKER_LINK_RE, '$1');
  body = body.replace(/\n{3,}/g, '\n\n');
  return body.trim() + '\n';
}

/** Take the first non-trivial paragraph as the description. */
function deriveDescription(body: string, max: number = 600): string {
  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 80 && !p.startsWith('#') && !p.startsWith('!') && !p.startsWith('['));
  const first = paragraphs[0] ?? body.slice(0, max);
  if (first.length <= max) return first;
  // Trim at the last sentence boundary.
  const window = first.slice(0, max);
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = window[i + 1];
      if (next === undefined || /\s/.test(next)) return window.slice(0, i + 1).trim();
    }
  }
  return window.trim();
}

// --- Main -------------------------------------------------------------------

type ImportRow = {
  sourceId: string;
  title: string;
  description: string;
  body: string;
  sourceUrl: string;
  category: 'journey-step';
  tags: string[];
  stageTags: string[];
  journeyStep: number;
  status: 'published';
};

function main() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) throw new Error('NEXT_PUBLIC_CONVEX_URL is not set.');

  const rows: ImportRow[] = STEPS.map(({ step, file, stageTags, tags }) => {
    const absPath = resolve(CONTENT, 'pages', file);
    const parsed = parseMarkdown(absPath);
    const body = cleanJourneyBody(parsed.body, parsed.title);
    const description = deriveDescription(body);
    const stem = file.replace(/\.md$/, '');
    return {
      sourceId: `journey:${step}`,
      title: parsed.title,
      description,
      body,
      sourceUrl: parsed.sourceUrl,
      category: 'journey-step',
      tags: [...tags, `step-${step}`, stem],
      stageTags,
      journeyStep: step,
      status: 'published',
    };
  });

  console.log(`Importing ${rows.length} journey steps via guidesInternal:importInternal…\n`);

  try {
    execFileSync(
      'pnpm',
      ['exec', 'convex', 'run', 'guidesInternal:importInternal', JSON.stringify({ rows })],
      { cwd: REPO_ROOT, stdio: 'inherit', env: process.env },
    );
  } catch (err) {
    console.error('Import failed:', err);
    process.exit(1);
  }

  console.log('\n────────── import summary ──────────');
  console.log(`  steps imported: ${rows.length}`);
  console.log('  Visit /guides/journey to verify.');
}

main();
