/**
 * P1.3 — Import LLM-generated resource rows from
 * data/resources-from-content.json into the Convex `resources` table via the
 * existing internal.resourceImport:importInternal mutation.
 *
 * Idempotent by sourceId (e.g., "content:nucleus-institute"). Re-runnable
 * after edits to the JSON file. Strips the script-only _meta field before
 * sending so Convex's validator doesn't reject the row.
 *
 * Usage (from repo root):
 *   pnpm exec convex env list   # confirm you're pointing at the right deployment
 *   pnpm import:content-resources
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RESOURCE_CATEGORY_KEYS } from '../lib/resources/categories';
import { resolveSeedTarget } from './lib/seed-target';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const INPUT = resolve(REPO_ROOT, 'data', 'resources-from-content.json');
const CHUNK_ROWS = 40; // matches seed-resources.ts; not strictly needed at n=9

type GeneratedRow = {
  sourceId: string;
  title: string;
  description: string;
  url: string;
  category: (typeof RESOURCE_CATEGORY_KEYS)[number];
  communitiesRaw?: string;
  industriesRaw?: string;
  locationsRaw?: string;
  tagsRaw?: string;
  _meta?: Record<string, unknown>;
};

type ImportRow = Omit<GeneratedRow, '_meta'>;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function main() {
  // CLI-only script: Convex CLI handles deployment resolution
  // (CONVEX_DEPLOYMENT / .convex/ / --prod). NEXT_PUBLIC_CONVEX_URL is for
  // ConvexHttpClient and is not required here.
  const { target, convexRunFlags } = resolveSeedTarget();

  const raw = readFileSync(INPUT, 'utf-8');
  const rows: GeneratedRow[] = JSON.parse(raw);

  // Validate inputs early so we don't half-import.
  for (const r of rows) {
    if (!r.sourceId || !r.title || !r.url || !r.description || !r.category) {
      throw new Error(`Row missing required field: ${JSON.stringify(r).slice(0, 120)}…`);
    }
    if (!RESOURCE_CATEGORY_KEYS.includes(r.category)) {
      throw new Error(`Row "${r.title}" has unknown category: ${r.category}`);
    }
  }

  // Strip the provenance _meta field — the Convex validator rejects extras.
  const cleaned: ImportRow[] = rows.map((r) => {
    const copy: Partial<GeneratedRow> = { ...r };
    delete copy._meta;
    return copy as ImportRow;
  });

  console.log(`[target=${target}] Parsed ${cleaned.length} content-derived rows from ${INPUT}`);
  console.log(`→ importInternal in chunks of ${CHUNK_ROWS}…\n`);

  let appliedChunks = 0;
  let failedChunks = 0;
  for (const batch of chunk(cleaned, CHUNK_ROWS)) {
    if (batch.length === 0) continue;
    const payload = JSON.stringify({ rows: batch, status: 'published' });
    try {
      execFileSync(
        'pnpm',
        ['exec', 'convex', 'run', ...convexRunFlags, 'resourceImport:importInternal', payload],
        { cwd: REPO_ROOT, stdio: 'inherit', env: process.env },
      );
      appliedChunks++;
      console.log(`Chunk ${appliedChunks}: ${batch.length} rows (${batch[0]?.title ?? ''} …)`);
    } catch (err) {
      failedChunks++;
      console.error(`Chunk failed (starts with: ${batch[0]?.title})`, err);
    }
  }

  console.log('\n────────── import summary ──────────');
  console.log(`  chunks succeeded: ${appliedChunks}`);
  console.log(`  chunks failed:    ${failedChunks}`);
  console.log(
    '\nConvex will schedule embedding backfills for new/changed rows. Visit /resources to verify.',
  );
}

main();
