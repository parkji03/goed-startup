/**
 * Seed Convex `resources` + facet joins from Builder Day CSV (directory list).
 *
 * Usage:
 *   pnpm seed:resources
 *
 * Default CSV: data/resources-builder-day.csv (override: first CLI arg path).
 *
 * Idempotent by `sourceId` via `internal.resourceInternal.upsertResource`.
 * Mirrors `scripts/seed-companies.ts`: HTTP client + public seed mutation pair.
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';

const CSV_PATH_DEFAULT = path.resolve(
  __dirname,
  '..',
  'data',
  'resources-builder-day.csv',
);

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL is not set. Populate .env.local (see .env.example) and run Convex dev/deploy.',
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

async function main() {
  const csvPath =
    typeof process.argv[2] === 'string'
      ? path.resolve(process.cwd(), process.argv[2])
      : CSV_PATH_DEFAULT;

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
      contactEmail: r.email?.trim() || undefined,
      communitiesRaw: r.Communities,
      industriesRaw: r.Industries,
      locationsRaw: r.Locations,
      topicsRaw: r.Topics,
    }));

  console.log(`Parsed ${rows.length} CSV rows → upsert…\n`);

  const client = new ConvexHttpClient(convexUrl!);
  let applied = 0;
  let skippedBlank = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.url.trim()) {
      skippedBlank++;
      continue;
    }
    try {
      const result = await client.mutation(api.resourceImport.seedUpsertRow, {
        row,
        status: 'published',
      });

      if (result.skipped) skippedBlank++;
      else applied++;

      console.log(`[${i + 1}/${rows.length}] ${result.skipped ? 'skip' : 'ok'} ${row.title}`);
    } catch (err) {
      failed++;
      console.error(`[${i + 1}/${rows.length}] ✗ ${row.title}: ${(err as Error).message}`);
    }
  }

  console.log('\n────────── seed summary ──────────');
  console.log(`  applied / upserted: ${applied}`);
  console.log(`  skipped blank URL:  ${skippedBlank}`);
  console.log(`  failures:           ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
