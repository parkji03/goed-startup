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
import { resolveConvexHttpUrl, resolveSeedTarget } from './lib/seed-target';

const CSV_PATH = path.resolve(
  __dirname,
  '..',
  'Map Data for Builder Day - investor-data-clean.csv',
);

const LINKEDIN_HIRING_PATH = path.resolve(
  __dirname,
  '..',
  'linkedin-hiring-data.json',
);

// Resolve target + URL up front so a misconfigured prod attempt fails before
// we read any CSV. resolveSeedTarget() throws if CONVEX_TARGET=prod without
// SEED_CONFIRM_PROD=1.
const SEED_TARGET = resolveSeedTarget();
const CONVEX_URL = resolveConvexHttpUrl(SEED_TARGET.target);

/**
 * Shape of `linkedin-hiring-data.json`. Only the fields we read are typed.
 */
type LinkedInHiringFile = {
  scraped_at: string;
  companies: LinkedInCompanyEntry[];
};

type LinkedInCompanyEntry = {
  company: string;
  linkedin_url: string | null;
  /** true / false / null. null means we couldn't determine — treat as 'unknown'. */
  is_hiring: boolean | null;
  listings: Array<{
    title: string;
    posted: string | null;
    job_id: string | null;
    url: string;
  }>;
};

type SeedJobListing = {
  source: 'linkedin' | 'manual';
  externalId?: string;
  title: string;
  url: string;
  department?: string;
  location?: string;
  postedAt?: number;
};

/**
 * Reduce a LinkedIn URL down to the company-page handle so we can join the
 * CSV (`linkedin.com/company/<handle>`) against the JSON
 * (`linkedin.com/company/<handle>/jobs/`). Returns undefined for non-LinkedIn
 * or malformed inputs.
 */
function linkedinHandle(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.toLowerCase().match(/linkedin\.com\/company\/([^/?#]+)/);
  return m?.[1];
}

/**
 * Build two indices off `linkedin-hiring-data.json`:
 *   - by handle (the LinkedIn company-page slug) — preferred, exact join
 *   - by lowercased name — fallback for the long tail
 */
function loadLinkedInData(): {
  byHandle: Map<string, LinkedInCompanyEntry>;
  byName: Map<string, LinkedInCompanyEntry>;
  scrapedAtMs: number;
} {
  const raw = fs.readFileSync(LINKEDIN_HIRING_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as LinkedInHiringFile;

  const byHandle = new Map<string, LinkedInCompanyEntry>();
  const byName = new Map<string, LinkedInCompanyEntry>();
  for (const e of parsed.companies) {
    const handle = linkedinHandle(e.linkedin_url);
    if (handle) byHandle.set(handle, e);
    byName.set(e.company.trim().toLowerCase(), e);
  }
  // Date strings like "2026-05-08" parse as midnight UTC; that's good enough
  // provenance for "as of …" labels.
  const scrapedAtMs = Date.parse(parsed.scraped_at);
  return {
    byHandle,
    byName,
    scrapedAtMs: Number.isFinite(scrapedAtMs) ? scrapedAtMs : Date.now(),
  };
}

/**
 * Compute the hiring status for a company from the join. Mirrors the spec:
 *   no LinkedIn URL on company → 'unknown'
 *   LinkedIn URL but no JSON entry / null is_hiring → 'unknown'
 *   listings.length > 0 → true
 *   listings.length === 0 → false
 */
function deriveHiringStatus(
  csvLinkedIn: string | undefined,
  entry: LinkedInCompanyEntry | undefined,
): boolean | 'unknown' {
  if (!csvLinkedIn) return 'unknown';
  if (!entry) return 'unknown';
  if (entry.is_hiring === true) return true;
  if (entry.is_hiring === false) return false;
  return 'unknown';
}

function listingsFromEntry(
  entry: LinkedInCompanyEntry | undefined,
): SeedJobListing[] {
  if (!entry?.listings) return [];
  return entry.listings.map((l) => {
    const postedAtMs = l.posted ? Date.parse(l.posted) : NaN;
    const out: SeedJobListing = {
      source: 'linkedin',
      title: l.title,
      url: l.url,
    };
    if (l.job_id) out.externalId = l.job_id;
    if (Number.isFinite(postedAtMs)) out.postedAt = postedAtMs;
    return out;
  });
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

function cleanString(raw: string | undefined): string | undefined {
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

  const linkedin = loadLinkedInData();
  console.log(
    `Loaded LinkedIn data: ${linkedin.byHandle.size} handle entries, ${linkedin.byName.size} name entries.\n`,
  );

  console.log(`[target=${SEED_TARGET.target}] Using Convex URL: ${CONVEX_URL}\n`);
  const client = new ConvexHttpClient(CONVEX_URL);

  const slugCounts = new Map<string, number>();
  let inserted = 0;
  let updated = 0;
  let listingsWritten = 0;
  // Counters by status are useful for spot-checking the join after a run.
  const hiringCounts = { true: 0, false: 0, unknown: 0 };
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

    const csvLinkedIn = cleanString(
      row['LinkedIn Link (map it to Links to get the logo)'],
    );
    // Match priority: handle (exact path-segment match) → name (fallback for
    // the rare row whose CSV LinkedIn URL is missing or malformed).
    const handle = linkedinHandle(csvLinkedIn);
    const handleEntry = handle ? linkedin.byHandle.get(handle) : undefined;
    const linkedinEntry =
      handleEntry ?? linkedin.byName.get(name.trim().toLowerCase());
    const hiringStatus = deriveHiringStatus(csvLinkedIn, linkedinEntry);
    const jobListings = listingsFromEntry(linkedinEntry);

    try {
      const result = await client.mutation(api.companies.seedOne, {
        name,
        slug,
        description: cleanString(row['Description of startup']),
        website: normalizeWebsite(row['Website'] ?? ''),
        linkedin: csvLinkedIn,
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
        hiringStatus,
        // Stamp every row with the scrape timestamp — even rows we didn't
        // find in the JSON, so "no LinkedIn match as of …" is queryable.
        linkedinSyncedAt: linkedin.scrapedAtMs,
        // Always pass the array (even when empty) so the mutation wipes
        // any stale listings that linger from a previous seed run.
        jobListings,
      });

      if (result.action === 'inserted') inserted++;
      else updated++;
      listingsWritten += result.listingsReplaced;
      hiringCounts[String(hiringStatus) as keyof typeof hiringCounts]++;

      const flag = geo ? '✓' : '⚠ no geo';
      const hireFlag =
        hiringStatus === true
          ? `🟢 ${jobListings.length}`
          : hiringStatus === false
            ? '⚪ 0'
            : '· ?';
      console.log(
        `[${i + 1}/${rows.length}] ${flag}  ${hireFlag}  ${result.action}: ${name}`,
      );
    } catch (err) {
      failures.push({ name, reason: (err as Error).message });
      console.error(`[${i + 1}/${rows.length}] ✗ failed: ${name} — ${(err as Error).message}`);
    }
  }

  console.log('\n────────── seed summary ──────────');
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  failures: ${failures.length}`);
  console.log(
    `  hiring:   true=${hiringCounts.true}  false=${hiringCounts.false}  unknown=${hiringCounts.unknown}`,
  );
  console.log(`  listings written: ${listingsWritten}`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.reason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
