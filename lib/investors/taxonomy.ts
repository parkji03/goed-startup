/**
 * Investor taxonomy — companion to lib/companies/taxonomy.ts but for the
 * OpenVC-sourced investor corpus. The OpenVC vocabulary doesn't align with
 * the company taxonomy (different stage labels, no sector concept, etc.) so
 * we keep the two domains in separate files.
 *
 * Each filter ID is a stable URL-safe slug. We map back to OpenVC's raw
 * source strings via the `*_TO_RAW` lookups so the Convex query can compare
 * against `investors.investorType` / `investors.stagesOfInvestment` exactly
 * as stored.
 *
 * Display labels live in i18n (`messages/{locale}.json` under
 * `Taxonomy.investor.*`) — call `t(\`investor.types.${id}\`)` and
 * `t(\`investor.stages.${id}\`)` from the consuming components.
 */

// ---------------------------------------------------------------------------
// Investor type
// ---------------------------------------------------------------------------

export const INVESTOR_TYPE_IDS = [
  'vc',
  'corporate-vc',
  'pe-fund',
  'public-fund',
  'family-office',
  'angel-network',
  'solo-angel',
  'incubator-accelerator',
  'startup-studio',
  'revenue-based',
  'other',
] as const;

export type InvestorTypeId = (typeof INVESTOR_TYPE_IDS)[number];

export function isInvestorTypeId(s: string): s is InvestorTypeId {
  return (INVESTOR_TYPE_IDS as readonly string[]).includes(s);
}

/**
 * Filter ID → raw OpenVC string stored on `investors.investorType`. Used
 * by the Convex query to translate URL state into doc-shape comparisons.
 *
 * The "Incubator, Accelerator" entry intentionally contains a comma — that's
 * how OpenVC writes it. The seed script never splits `investorType` on
 * commas (only countries/stages get split), so the raw value round-trips.
 */
export const INVESTOR_TYPE_TO_RAW: Record<InvestorTypeId, string> = {
  vc: 'VC',
  'corporate-vc': 'Corporate VC',
  'pe-fund': 'PE fund',
  'public-fund': 'Public fund',
  'family-office': 'Family office',
  'angel-network': 'Angel network',
  'solo-angel': 'Solo angel',
  'incubator-accelerator': 'Incubator, Accelerator',
  'startup-studio': 'Startup studio',
  'revenue-based': 'Revenue-based',
  other: 'Other',
};

// ---------------------------------------------------------------------------
// Investment stage (OpenVC numbered tokens)
// ---------------------------------------------------------------------------

export const INVESTOR_STAGE_IDS = [
  'idea',
  'prototype',
  'early-revenue',
  'scaling',
  'growth',
  'pre-ipo',
] as const;

export type InvestorStageId = (typeof INVESTOR_STAGE_IDS)[number];

export function isInvestorStageId(s: string): s is InvestorStageId {
  return (INVESTOR_STAGE_IDS as readonly string[]).includes(s);
}

/**
 * Stage filter ID → raw OpenVC token (numbered). Investors store the
 * numbered form ("1. Idea or Patent") so the query has to match that.
 */
export const INVESTOR_STAGE_TO_RAW: Record<InvestorStageId, string> = {
  idea: '1. Idea or Patent',
  prototype: '2. Prototype',
  'early-revenue': '3. Early Revenue',
  scaling: '4. Scaling',
  growth: '5. Growth',
  'pre-ipo': '6. Pre-IPO',
};

// ---------------------------------------------------------------------------
// Cheque size buckets
// ---------------------------------------------------------------------------

/**
 * Bucketed first-cheque ranges. An investor matches a bucket if the
 * investor's [firstChequeMin, firstChequeMax] interval *overlaps* the
 * bucket's interval — a fuzzy "around this size" match. Open-ended
 * buckets use 0 / Infinity for the missing bound.
 */
export const CHEQUE_BUCKETS = [
  { id: 'under-50k', min: 0,           max: 50_000 },
  { id: '50k-250k',  min: 50_000,      max: 250_000 },
  { id: '250k-1m',   min: 250_000,     max: 1_000_000 },
  { id: '1m-5m',     min: 1_000_000,   max: 5_000_000 },
  { id: '5m-plus',   min: 5_000_000,   max: Number.POSITIVE_INFINITY },
] as const;

export type ChequeBucketId = (typeof CHEQUE_BUCKETS)[number]['id'];

export const CHEQUE_BUCKET_IDS: readonly ChequeBucketId[] = CHEQUE_BUCKETS.map(
  (b) => b.id,
);

export function isChequeBucketId(s: string): s is ChequeBucketId {
  return (CHEQUE_BUCKET_IDS as readonly string[]).includes(s);
}

/**
 * Test whether an investor's cheque range overlaps any of the selected
 * buckets. An undefined min is treated as 0 (no floor); an undefined max
 * as Infinity (no ceiling). An investor with neither bound defined cannot
 * be matched by any bucket — caller decides whether to include or exclude
 * those (today: exclude when any bucket is selected).
 */
export function chequeOverlapsAnyBucket(
  invMin: number | undefined,
  invMax: number | undefined,
  bucketIds: readonly ChequeBucketId[],
): boolean {
  if (bucketIds.length === 0) return true; // no filter ⇒ pass
  if (invMin == null && invMax == null) return false;
  const lo = invMin ?? 0;
  const hi = invMax ?? Number.POSITIVE_INFINITY;
  for (const id of bucketIds) {
    const b = CHEQUE_BUCKETS.find((x) => x.id === id);
    if (!b) continue;
    // Standard interval overlap: lo ≤ b.max && hi ≥ b.min
    if (lo <= b.max && hi >= b.min) return true;
  }
  return false;
}
