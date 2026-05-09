/**
 * P3.3 — Import LLM-generated guide rows from data/guides-from-content.json
 * into the Convex `guides` table via internal.guidesInternal:importInternal.
 *
 * Idempotent by sourceId (e.g., "guide:crowdfunding-..."). Re-runnable.
 *
 * Usage:
 *   pnpm import:content-guides
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GUIDE_CATEGORY_KEYS } from '../lib/guides/categories';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const INPUT = resolve(REPO_ROOT, 'data', 'guides-from-content.json');
const CHUNK_ROWS = 20;

type GeneratedGuide = {
  sourceId: string;
  title: string;
  description: string;
  body: string;
  sourceUrl: string;
  category: (typeof GUIDE_CATEGORY_KEYS)[number];
  tags: string[];
  stageTags: string[];
  journeyStep?: number;
  _meta?: Record<string, unknown>;
};

type ImportRow = Omit<GeneratedGuide, '_meta'> & { status: 'published' };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function main() {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not set.');
  }
  const rows: GeneratedGuide[] = JSON.parse(readFileSync(INPUT, 'utf-8'));

  for (const r of rows) {
    if (!r.sourceId || !r.title || !r.sourceUrl || !r.body || !r.description || !r.category) {
      throw new Error(`Row missing required field: ${JSON.stringify(r).slice(0, 120)}…`);
    }
    if (!GUIDE_CATEGORY_KEYS.includes(r.category)) {
      throw new Error(`Row "${r.title}" has unknown category: ${r.category}`);
    }
  }

  const cleaned: ImportRow[] = rows.map((r) => {
    const copy: Partial<GeneratedGuide> = { ...r };
    delete copy._meta;
    return { ...(copy as Omit<GeneratedGuide, '_meta'>), status: 'published' };
  });

  console.log(`Importing ${cleaned.length} guides → guidesInternal:importInternal in chunks of ${CHUNK_ROWS}…\n`);

  let appliedChunks = 0;
  let failedChunks = 0;
  for (const batch of chunk(cleaned, CHUNK_ROWS)) {
    if (batch.length === 0) continue;
    const payload = JSON.stringify({ rows: batch });
    try {
      execFileSync('pnpm', ['exec', 'convex', 'run', 'guidesInternal:importInternal', payload], {
        cwd: REPO_ROOT,
        stdio: 'inherit',
        env: process.env,
      });
      appliedChunks++;
      console.log(`Chunk ${appliedChunks}: ${batch.length} guides (${batch[0]?.title ?? ''} …)`);
    } catch (err) {
      failedChunks++;
      console.error(`Chunk failed (starts with: ${batch[0]?.title})`, err);
    }
  }

  console.log('\n────────── import summary ──────────');
  console.log(`  chunks succeeded: ${appliedChunks}`);
  console.log(`  chunks failed:    ${failedChunks}`);
  console.log('\nVisit /guides to verify.');
}

main();
