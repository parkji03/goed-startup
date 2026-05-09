/**
 * Seed Convex `resources` + facet joins from Builder Day CSV (directory list).
 *
 * Usage (from repo root, with Convex dev / deploy linked — needs `pnpm exec convex` CLI):
 *   pnpm seed:resources
 *
 * Default CSV: data/resources-builder-day.csv (override: first CLI arg path).
 *
 * Idempotent by `sourceId` via `internal.resourceImport:importInternal` (not callable from browsers).
 *
 * Per-row pipeline:
 *   1. CSV row → split Topics into a string array
 *   2. assignCategory(title, topics) → category (rule-based)
 *   3. category-overrides.json (keyed by sourceId) wins over rule-based when present
 *   4. cleanTags(topics) → tagsRaw (drops stage-fragment topics like "Late Stage Growth")
 *   5. Pass {sourceId, title, description, url, category, communitiesRaw,
 *      industriesRaw, locationsRaw, tagsRaw} to importInternal
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

import { sanitizeContactEmail } from '../convex/lib/resourceHelpers';
import {
  RESOURCE_CATEGORY_KEYS,
  type ResourceCategoryKey,
} from '../lib/resources/categories';
import { assignCategory, cleanTags } from '../lib/resources/migration-rules';
import { resolveSeedTarget } from './lib/seed-target';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH_DEFAULT = path.resolve(scriptDir, '..', 'data', 'resources-builder-day.csv');
const OVERRIDES_PATH = path.resolve(scriptDir, '..', 'data', 'category-overrides.json');
const repoRoot = path.resolve(scriptDir, '..');

const CHUNK_ROWS = 40;

// Note: this script uses the Convex CLI (`convex run`) which reads its own
// deployment env (CONVEX_DEPLOYMENT, .convex/, or `--prod`). NEXT_PUBLIC_CONVEX_URL
// is intentionally NOT required here — that env var is for ConvexHttpClient,
// which this script doesn't use.

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

type Override = { category: ResourceCategoryKey; reason?: string };

function splitPipe(value: string | undefined): string[] {
  return (value ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function loadOverrides(): Record<string, Override> {
  if (!fs.existsSync(OVERRIDES_PATH)) return {};
  const raw = fs.readFileSync(OVERRIDES_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Record<string, Override>;
  for (const [sourceId, ov] of Object.entries(parsed)) {
    if (!RESOURCE_CATEGORY_KEYS.includes(ov.category)) {
      throw new Error(
        `data/category-overrides.json: sourceId=${sourceId} has unknown category "${ov.category}"`,
      );
    }
  }
  return parsed;
}

async function main() {
  const { target, convexRunFlags } = resolveSeedTarget();

  const csvPath =
    typeof process.argv[2] === 'string' ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH_DEFAULT;

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }

  const overrides = loadOverrides();
  let overrideHits = 0;

  const rows = parsed.data
    .filter((r) => Boolean(r.Title?.trim() && String(r.id) && r.link?.trim()))
    .map((r) => {
      const sourceId = String(r.id);
      const title = String(r.Title).trim();
      const topics = splitPipe(r.Topics);
      const ruleResult = assignCategory({ title, topics });
      let category: ResourceCategoryKey = ruleResult.category;
      if (overrides[sourceId]) {
        category = overrides[sourceId].category;
        overrideHits++;
      }
      const tagsRaw = cleanTags(topics).join('|');
      return {
        sourceId,
        title,
        description: (r.description ?? '').trim(),
        url: String(r.link).trim(),
        contactEmail: sanitizeContactEmail(r.email?.trim()),
        communitiesRaw: r.Communities,
        industriesRaw: r.Industries,
        locationsRaw: r.Locations,
        tagsRaw,
        category,
      };
    });

  const categoryCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[target=${target}] Parsed ${rows.length} CSV rows (${overrideHits} category overrides applied) → importInternal in chunks of ${CHUNK_ROWS}…`,
  );
  console.log('  category distribution:');
  for (const [key, n] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n.toString().padStart(4)}  ${key}`);
  }
  console.log('');

  let appliedChunks = 0;
  let failed = 0;

  for (const batch of chunk(rows, CHUNK_ROWS)) {
    const usable = batch.filter((r) => r.url.trim());
    if (usable.length === 0) continue;

    try {
      const payload = JSON.stringify({ rows: usable, status: 'published' });
      execFileSync(
        'pnpm',
        ['exec', 'convex', 'run', ...convexRunFlags, 'resourceImport:importInternal', payload],
        { cwd: repoRoot, stdio: 'inherit', env: process.env },
      );
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
