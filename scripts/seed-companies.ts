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
import { FOUNDED_YEAR_OVERRIDES } from '../data/founded-year-overrides';
import { geocode } from './lib/geocode';

const CSV_PATH = path.resolve(
  __dirname,
  '..',
  'Map Data for Builder Day - investor-data-clean.csv',
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
  'Founded Year'?: string;
  'Founded Source'?: string;
  'Logo URL'?: string;
  'Logo Source'?: string;
  'Pitch'?: string;
  'Product Category'?: string;
  'Target Market'?: string;
  'Monetization Model'?: string;
  'Founders'?: string;
  'Notable Customers'?: string;
  'Funding'?: string;
  'Open Role Count'?: string;
  'Differentiation Claim'?: string;
  'Key Metrics'?: string;
  'Integrations'?: string;
  'Pages Crawled'?: string;
  'Hallucination Flags'?: string;
};

type TargetMarket =
  | 'enterprise'
  | 'mid-market'
  | 'smb'
  | 'consumer'
  | 'developer'
  | 'prosumer';

type MonetizationModel =
  | 'subscription'
  | 'usage-based'
  | 'marketplace'
  | 'transactional'
  | 'freemium'
  | 'contact-sales'
  | 'ads';

type Founder = {
  name: string;
  title?: string;
  priorCompanies?: string[];
  sourceQuote?: string;
};

type Funding = {
  round?: string;
  amountUsd?: number;
  leadInvestor?: string;
  sourceQuote?: string;
};

type DifferentiationClaim = {
  claim: string;
  sourceQuote?: string;
};

type KeyMetric = {
  metric: string;
  value: string;
  sourceQuote: string;
};

const TARGET_MARKETS: ReadonlySet<TargetMarket> = new Set([
  'enterprise',
  'mid-market',
  'smb',
  'consumer',
  'developer',
  'prosumer',
]);
const MONETIZATION_MODELS: ReadonlySet<MonetizationModel> = new Set([
  'subscription',
  'usage-based',
  'marketplace',
  'transactional',
  'freemium',
  'contact-sales',
  'ads',
]);

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

function parseYear(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1900 || n > new Date().getFullYear() + 1) {
    return undefined;
  }
  return n;
}

function parseInteger(raw: string | undefined): number | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : undefined;
}

function parseJsonOr<T>(raw: string | undefined, fallback: T): T | unknown {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  try {
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function parseTargetMarket(raw: string | undefined): TargetMarket | undefined {
  const v = raw?.trim() as TargetMarket | undefined;
  return v && TARGET_MARKETS.has(v) ? v : undefined;
}

function parseMonetizationModel(
  raw: string | undefined,
): MonetizationModel | undefined {
  const v = raw?.trim() as MonetizationModel | undefined;
  return v && MONETIZATION_MODELS.has(v) ? v : undefined;
}

function parseStringArray(raw: string | undefined): string[] | undefined {
  const parsed = parseJsonOr(raw, undefined);
  if (!Array.isArray(parsed)) return undefined;
  const cleaned = parsed.filter(
    (x): x is string => typeof x === 'string' && x.trim().length > 0,
  );
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseFounders(raw: string | undefined): Founder[] | undefined {
  const parsed = parseJsonOr(raw, undefined);
  if (!Array.isArray(parsed)) return undefined;
  const cleaned = parsed
    .filter((f): f is Record<string, unknown> => typeof f === 'object' && f !== null)
    .map((f): Founder | null => {
      const name = typeof f.name === 'string' ? f.name.trim() : '';
      if (!name) return null;
      const out: Founder = { name };
      if (typeof f.title === 'string' && f.title.trim()) out.title = f.title.trim();
      if (Array.isArray(f.priorCompanies)) {
        const prior = f.priorCompanies.filter(
          (c): c is string => typeof c === 'string' && c.trim().length > 0,
        );
        if (prior.length > 0) out.priorCompanies = prior;
      }
      if (typeof f.sourceQuote === 'string' && f.sourceQuote.trim()) {
        out.sourceQuote = f.sourceQuote.trim();
      }
      return out;
    })
    .filter((f): f is Founder => f !== null);
  return cleaned.length > 0 ? cleaned : undefined;
}

function parseFunding(raw: string | undefined): Funding | undefined {
  const parsed = parseJsonOr(raw, undefined);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  const out: Funding = {};
  if (typeof obj.round === 'string' && obj.round.trim()) out.round = obj.round.trim();
  if (typeof obj.amountUsd === 'number' && Number.isFinite(obj.amountUsd))
    out.amountUsd = obj.amountUsd;
  if (typeof obj.leadInvestor === 'string' && obj.leadInvestor.trim())
    out.leadInvestor = obj.leadInvestor.trim();
  if (typeof obj.sourceQuote === 'string' && obj.sourceQuote.trim())
    out.sourceQuote = obj.sourceQuote.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

function parseDifferentiationClaim(
  raw: string | undefined,
): DifferentiationClaim | undefined {
  const parsed = parseJsonOr(raw, undefined);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const obj = parsed as Record<string, unknown>;
  const claim = typeof obj.claim === 'string' ? obj.claim.trim() : '';
  if (!claim) return undefined;
  const out: DifferentiationClaim = { claim };
  if (typeof obj.sourceQuote === 'string' && obj.sourceQuote.trim())
    out.sourceQuote = obj.sourceQuote.trim();
  return out;
}

type InvestorBrief = {
  pitch?: string;
  productCategory?: string;
  targetMarket?: TargetMarket;
  monetizationModel?: MonetizationModel;
  founders?: Founder[];
  notableCustomers?: string[];
  funding?: Funding;
  openRoleCount?: number;
  differentiationClaim?: DifferentiationClaim;
  keyMetrics?: KeyMetric[];
  integrations?: string[];
  pagesCrawled?: string[];
  flags?: string[];
  extractedAt?: number;
};

/**
 * Assemble the nested investor-brief object from CSV columns. Returns
 * undefined if no field has a value — keeps the row's `investorBrief`
 * absent rather than serializing an empty `{}`.
 */
function buildInvestorBrief(row: CsvRow): InvestorBrief | undefined {
  const brief: InvestorBrief = {};
  const pitch = cleanString(row['Pitch']);
  if (pitch) brief.pitch = pitch;
  const productCategory = cleanString(row['Product Category']);
  if (productCategory) brief.productCategory = productCategory;
  const targetMarket = parseTargetMarket(row['Target Market']);
  if (targetMarket) brief.targetMarket = targetMarket;
  const monetizationModel = parseMonetizationModel(row['Monetization Model']);
  if (monetizationModel) brief.monetizationModel = monetizationModel;
  const founders = parseFounders(row['Founders']);
  if (founders) brief.founders = founders;
  const notableCustomers = parseStringArray(row['Notable Customers']);
  if (notableCustomers) brief.notableCustomers = notableCustomers;
  const funding = parseFunding(row['Funding']);
  if (funding) brief.funding = funding;
  const openRoleCount = parseInteger(row['Open Role Count']);
  if (openRoleCount !== undefined) brief.openRoleCount = openRoleCount;
  const differentiationClaim = parseDifferentiationClaim(row['Differentiation Claim']);
  if (differentiationClaim) brief.differentiationClaim = differentiationClaim;
  const keyMetrics = parseKeyMetrics(row['Key Metrics']);
  if (keyMetrics) brief.keyMetrics = keyMetrics;
  const integrations = parseStringArray(row['Integrations']);
  if (integrations) brief.integrations = integrations;
  const pagesCrawled = parseStringArray(row['Pages Crawled']);
  if (pagesCrawled) brief.pagesCrawled = pagesCrawled;
  const flags = parseStringArray(row['Hallucination Flags']);
  if (flags) brief.flags = flags;

  if (Object.keys(brief).length === 0) return undefined;
  brief.extractedAt = Date.now();
  return brief;
}

function parseKeyMetrics(raw: string | undefined): KeyMetric[] | undefined {
  const parsed = parseJsonOr(raw, undefined);
  if (!Array.isArray(parsed)) return undefined;
  const cleaned = parsed
    .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
    .map((m): KeyMetric | null => {
      const metric = typeof m.metric === 'string' ? m.metric.trim() : '';
      const value = typeof m.value === 'string' ? m.value.trim() : '';
      const sourceQuote = typeof m.sourceQuote === 'string' ? m.sourceQuote.trim() : '';
      // Schema requires all three. Drop any incomplete record rather than seeding garbage.
      if (!metric || !value || !sourceQuote) return null;
      return { metric, value, sourceQuote };
    })
    .filter((m): m is KeyMetric => m !== null);
  return cleaned.length > 0 ? cleaned : undefined;
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
        sector: normalizeSector(row['Section'] ?? ''),
        stage: normalizeStage(row['Stage']),
        employeeCount: normalizeEmployeeCount(row['# of Employees ']),
        yearFounded: FOUNDED_YEAR_OVERRIDES[slug] ?? parseYear(row['Founded Year']),
        investorBrief: buildInvestorBrief(row),
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
