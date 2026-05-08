/**
 * Seed the Convex `companies` table from the Builder Day Map Data CSV.
 *
 * Usage:
 *   pnpm seed:companies
 *
 * Idempotent: re-running upserts by slug. Geocodes inline via Mapbox.
 * Logs progress; summarizes inserts / updates / failures at the end.
 */

import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api';
import {
  normalizeSector,
  normalizeStage,
  normalizeEmployeeCount,
} from '../lib/companies/taxonomy';
import { ADDRESS_OVERRIDES } from '../data/address-overrides';
import { geocode } from './lib/geocode';

const CSV_PATH = path.resolve(
  __dirname,
  '..',
  'Map Data for Builder Day  - Sheet1.csv',
);

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL is not set. Make sure `npx convex dev` has run and .env.local is populated.',
  );
}

type CsvRow = {
  'Display Type': string;
  'LinkedIn Link (map it to Links to get the logo)': string;
  'Startup Name ': string;
  'Full Address': string;
  'Description of startup': string;
  'Website': string;
  'Stage': string;
  '# of Employees ': string;
  'Section': string;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeWebsite(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function cleanString(raw: string): string | undefined {
  const trimmed = raw?.trim();
  return trimmed || undefined;
}

async function main() {
  const csvText = fs.readFileSync(CSV_PATH, 'utf-8');
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }

  const rows = parsed.data.filter((r) => r['Startup Name ']?.trim());
  console.log(`Parsed ${rows.length} rows with names. Beginning seed…\n`);

  const client = new ConvexHttpClient(CONVEX_URL!);

  const slugCounts = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  const failures: { name: string; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row['Startup Name '].trim();

    // Resolve unique slug — append counter on collision
    const baseSlug = slugify(name);
    const count = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, count);
    const slug = count === 1 ? baseSlug : `${baseSlug}-${count}`;

    const csvAddress = row['Full Address']?.trim() ?? '';
    const rawAddress = ADDRESS_OVERRIDES[slug]?.trim() || csvAddress;

    let geo = null;
    if (rawAddress) {
      try {
        geo = await geocode(rawAddress);
      } catch (err) {
        console.warn(`  geocode error for "${name}": ${(err as Error).message}`);
      }
    }

    try {
      const result = await client.mutation(api.companies.seedOne, {
        name,
        slug,
        description: cleanString(row['Description of startup']),
        website: normalizeWebsite(row['Website'] ?? ''),
        linkedin: cleanString(row['LinkedIn Link (map it to Links to get the logo)']),
        sector: normalizeSector(row['Section']),
        stage: normalizeStage(row['Stage']),
        employeeCount: normalizeEmployeeCount(row['# of Employees ']),
        location: {
          rawAddress,
          city: geo?.city,
          county: geo?.county,
          state: geo?.state,
          lng: geo?.lng,
          lat: geo?.lat,
        },
      });

      if (result.action === 'inserted') inserted++;
      else updated++;

      const flag = geo ? '✓' : '⚠ no geo';
      console.log(`[${i + 1}/${rows.length}] ${flag}  ${result.action}: ${name}`);
    } catch (err) {
      failures.push({ name, reason: (err as Error).message });
      console.error(`[${i + 1}/${rows.length}] ✗ failed: ${name} — ${(err as Error).message}`);
    }
  }

  console.log('\n────────── seed summary ──────────');
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  failures: ${failures.length}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
