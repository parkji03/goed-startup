/**
 * Seed Convex `resources` + facet joins from Builder Day CSV (directory list).
 *
 * Usage (from repo root, with Convex dev / deploy linked — needs `pnpm exec convex` CLI):
 *   pnpm seed:resources
 *
 * Default CSV: data/resources-builder-day.csv (override: first CLI arg path).
 *
 * Idempotent by `sourceId` via `internal.resourceImport:importInternal` (not callable from browsers).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

import { sanitizeContactEmail } from '../convex/lib/resourceHelpers';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH_DEFAULT = path.resolve(scriptDir, '..', 'data', 'resources-builder-day.csv');
const repoRoot = path.resolve(scriptDir, '..');

const CHUNK_ROWS = 40;

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL is not set. Populate .env.local (see .env.example) and link Convex.',
  );
}

type CsvRow = {
  id: string;
  Title: string;
  description: string;
  Communities: string;
  Industries: string;
  Locations: string;
  Topics: string;
  link: string;
  email?: string;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const csvPath =
    typeof process.argv[2] === 'string' ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH_DEFAULT;

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }

  const rows = parsed.data
    .filter((r) => Boolean(r.Title?.trim() && String(r.id) && r.link?.trim()))
    .map((r) => ({
      sourceId: String(r.id),
      title: String(r.Title).trim(),
      description: (r.description ?? '').trim(),
      url: String(r.link).trim(),
      contactEmail: sanitizeContactEmail(r.email?.trim()),
      communitiesRaw: r.Communities,
      industriesRaw: r.Industries,
      locationsRaw: r.Locations,
      topicsRaw: r.Topics,
    }));

  console.log(`Parsed ${rows.length} CSV rows → importInternal in chunks of ${CHUNK_ROWS}…\n`);

  let appliedChunks = 0;
  let failed = 0;

  for (const batch of chunk(rows, CHUNK_ROWS)) {
    const usable = batch.filter((r) => r.url.trim());
    if (usable.length === 0) continue;

    try {
      const payload = JSON.stringify({ rows: usable, status: 'published' });
      execFileSync('pnpm', ['exec', 'convex', 'run', 'resourceImport:importInternal', payload], {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
      });
      appliedChunks++;
      console.log(`Chunk ${appliedChunks}: ${usable.length} rows (${usable[0]?.title ?? ''} …)`);
    } catch {
      failed++;
      console.error(`Chunk failed (starts with: ${usable[0]?.title})`);
    }
  }

  console.log('\n────────── seed summary ──────────');
  console.log(`  chunks succeeded: ${appliedChunks}`);
  console.log(`  chunks failed:    ${failed}`);
  console.log('\nConvex will schedule embedding backfills for new/changed rows (see dashboard logs).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
