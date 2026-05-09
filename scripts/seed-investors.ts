/**
 * Seed the Convex `investors` table from the OpenVC October 2025 export.
 *
 * Usage:
 *   pnpm seed:investors
 *   pnpm seed:investors --no-geocode    # skip the geocoding pre-pass
 *   pnpm seed:investors --limit=50      # only process first N rows (smoke test)
 *
 * Idempotent: re-running upserts by slug. Geocodes worldwide via Mapbox with
 * a disk cache at `data/investor-geocode-cache.json` so re-runs are free.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';
import { geocodeWorldwide, type WorldwideGeocodeResult } from './lib/geocode';
import { resolveConvexHttpUrl, resolveSeedTarget } from './lib/seed-target';

const XLSX_PATH = path.resolve(__dirname, '..', 'Oct 2025 - OpenVC.xlsx');
const SHEET_NAME = 'Oct 2025 - OpenVC';
const GEOCODE_CACHE_PATH = path.resolve(
  __dirname,
  '..',
  'data',
  'investor-geocode-cache.json',
);

// Resolve target + URL up front so a misconfigured prod attempt fails before
// we read the xlsx. resolveSeedTarget() throws if CONVEX_TARGET=prod without
// SEED_CONFIRM_PROD=1.
const SEED_TARGET = resolveSeedTarget();
const CONVEX_URL = resolveConvexHttpUrl(SEED_TARGET.target);

// ---- CLI args -------------------------------------------------------------

const args = process.argv.slice(2);
const SKIP_GEOCODE = args.includes('--no-geocode');
const LIMIT = (() => {
  const arg = args.find((a) => a.startsWith('--limit='));
  if (!arg) return undefined;
  const n = Number(arg.slice('--limit='.length));
  return Number.isInteger(n) && n > 0 ? n : undefined;
})();

// ---- Types ----------------------------------------------------------------

/** Shape of one row in the OpenVC sheet, keyed by header text. */
type RawRow = {
  'Investor name'?: string | null;
  Website?: string | null;
  'Global HQ'?: string | null;
  'Countries of investment'?: string | null;
  'Stage of investment'?: string | null;
  'Investment thesis'?: string | null;
  'Investor type'?: string | null;
  'First cheque minimum'?: number | string | null;
  'First cheque maximum'?: number | string | null;
};

// ---- Helpers --------------------------------------------------------------

function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function cleanString(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  return trimmed || undefined;
}

function normalizeWebsite(raw: string | null | undefined): string | undefined {
  const trimmed = cleanString(raw);
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parseNumber(raw: number | string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
  return Number.isFinite(n) ? n : undefined;
}

/** Split on bare commas. Trims each token; drops empties. */
function splitCsv(raw: string | null | undefined): string[] {
  const trimmed = cleanString(raw);
  if (!trimmed) return [];
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ---- Geocode cache --------------------------------------------------------

type CacheEntry = WorldwideGeocodeResult | null;
type Cache = Record<string, CacheEntry>;

function loadCache(): Cache {
  try {
    return JSON.parse(fs.readFileSync(GEOCODE_CACHE_PATH, 'utf8')) as Cache;
  } catch {
    return {};
  }
}

function saveCache(cache: Cache): void {
  fs.mkdirSync(path.dirname(GEOCODE_CACHE_PATH), { recursive: true });
  fs.writeFileSync(GEOCODE_CACHE_PATH, JSON.stringify(cache, null, 2));
}

/**
 * Run an async mapper over `items` with at most `concurrency` in flight at
 * once. Order-preserving via index assignment. Inlined instead of pulling
 * `p-limit` to keep the dep surface small for a one-off seed.
 */
async function mapConcurrent<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---- Main -----------------------------------------------------------------

async function main() {
  console.log(`Reading ${XLSX_PATH}…`);
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`xlsx not found at ${XLSX_PATH}`);
  }
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[SHEET_NAME];
  if (!ws) {
    throw new Error(
      `Sheet "${SHEET_NAME}" not found. Available: ${wb.SheetNames.join(', ')}`,
    );
  }
  const rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: null });
  console.log(`  ${rows.length} rows in sheet`);

  // ---- Pre-process rows --------------------------------------------------

  type Prepped = {
    name: string;
    slug: string;
    website?: string;
    globalHq?: string;
    countriesOfInvestment: string[];
    stagesOfInvestment: string[];
    investmentThesis?: string;
    investorType?: string;
    firstChequeMin?: number;
    firstChequeMax?: number;
  };

  const slugCounts = new Map<string, number>();
  const prepped: Prepped[] = [];
  let skippedNoName = 0;

  for (const row of rows) {
    const name = cleanString(row['Investor name']);
    if (!name) {
      skippedNoName += 1;
      continue;
    }

    // Resolve unique slug — append counter on collision
    const baseSlug = slugify(name) || 'investor';
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;

    prepped.push({
      name,
      slug,
      website: normalizeWebsite(row.Website),
      globalHq: cleanString(row['Global HQ']),
      countriesOfInvestment: splitCsv(row['Countries of investment']),
      stagesOfInvestment: splitCsv(row['Stage of investment']),
      investmentThesis: cleanString(row['Investment thesis']),
      // NOTE: type can contain commas (e.g. "Incubator, Accelerator") — keep raw.
      investorType: cleanString(row['Investor type']),
      firstChequeMin: parseNumber(row['First cheque minimum']),
      firstChequeMax: parseNumber(row['First cheque maximum']),
    });
  }
  if (skippedNoName > 0) console.log(`  ${skippedNoName} rows skipped (no name)`);
  const slice = LIMIT ? prepped.slice(0, LIMIT) : prepped;
  console.log(`  ${slice.length} rows to upsert${LIMIT ? ` (--limit=${LIMIT})` : ''}`);

  // ---- Geocode pre-pass (with disk cache) --------------------------------

  const cache = loadCache();
  const cacheBefore = Object.keys(cache).length;
  const locationByAddress = new Map<string, WorldwideGeocodeResult | null>();
  for (const k of Object.keys(cache)) locationByAddress.set(k, cache[k]);

  if (!SKIP_GEOCODE) {
    const uniqAddresses = Array.from(
      new Set(slice.map((p) => p.globalHq).filter((s): s is string => !!s)),
    );
    const todo = uniqAddresses.filter((a) => !locationByAddress.has(a));
    console.log(
      `Geocoding: ${uniqAddresses.length} unique HQs (${cacheBefore} cached, ${todo.length} to fetch)`,
    );

    let done = 0;
    let saveCounter = 0;
    await mapConcurrent(todo, 5, async (addr) => {
      let result: WorldwideGeocodeResult | null = null;
      try {
        result = await geocodeWorldwide(addr);
      } catch (err) {
        console.warn(`  geocode failed for ${addr}: ${(err as Error).message}`);
        return;
      }
      cache[addr] = result;
      locationByAddress.set(addr, result);
      done += 1;
      saveCounter += 1;
      if (saveCounter >= 50) {
        saveCache(cache);
        saveCounter = 0;
      }
      if (done % 100 === 0) {
        console.log(`  geocoded ${done}/${todo.length}`);
      }
    });
    saveCache(cache);
    console.log(`  geocoded ${done} new addresses; cache now ${Object.keys(cache).length}`);
  } else {
    console.log('Geocoding: SKIPPED (--no-geocode)');
  }

  // ---- Upsert via Convex -------------------------------------------------

  console.log(`[target=${SEED_TARGET.target}] Using Convex URL: ${CONVEX_URL}\n`);
  const client = new ConvexHttpClient(CONVEX_URL);
  let inserted = 0;
  let updated = 0;
  const failures: Array<{ slug: string; error: string }> = [];

  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    const geo = p.globalHq ? locationByAddress.get(p.globalHq) ?? null : null;
    const location = p.globalHq
      ? {
          rawAddress: p.globalHq,
          city: geo?.city,
          region: geo?.region,
          country: geo?.country,
          lng: geo?.lng,
          lat: geo?.lat,
        }
      : undefined;

    try {
      const res = await client.mutation(api.investors.seedOne, {
        name: p.name,
        slug: p.slug,
        website: p.website,
        globalHq: p.globalHq,
        location,
        countriesOfInvestment: p.countriesOfInvestment,
        stagesOfInvestment: p.stagesOfInvestment,
        investmentThesis: p.investmentThesis,
        investorType: p.investorType,
        firstChequeMin: p.firstChequeMin,
        firstChequeMax: p.firstChequeMax,
        source: 'openvc',
      });
      if (res.action === 'inserted') inserted += 1;
      else updated += 1;
    } catch (err) {
      failures.push({ slug: p.slug, error: (err as Error).message });
    }

    if ((i + 1) % 100 === 0) {
      console.log(`  upserted ${i + 1}/${slice.length} (${inserted} new, ${updated} patched, ${failures.length} failed)`);
    }
  }

  console.log('\n----- Summary -----');
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  failed:   ${failures.length}`);
  if (failures.length > 0) {
    console.log('\nFirst 10 failures:');
    for (const f of failures.slice(0, 10)) {
      console.log(`  ${f.slug}: ${f.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
