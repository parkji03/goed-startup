/**
 * AI-extracted investor-brief types — mirror the Convex validators in
 * `convex/schema.ts`. Defined here (not imported from Convex) so client code
 * can carry the type without dragging the server-only schema module.
 *
 * Provenance: anything in this shape came from the
 * `scripts/find-investor-data.py` pipeline (Claude Haiku 4.5 over crawled
 * website markdown). Treat as best-effort, not curated.
 */

export const TARGET_MARKET_IDS = [
  'enterprise',
  'mid-market',
  'smb',
  'consumer',
  'developer',
  'prosumer',
] as const;
export type TargetMarketId = (typeof TARGET_MARKET_IDS)[number];

export const MONETIZATION_MODEL_IDS = [
  'subscription',
  'usage-based',
  'marketplace',
  'transactional',
  'freemium',
  'contact-sales',
  'ads',
] as const;
export type MonetizationModelId = (typeof MONETIZATION_MODEL_IDS)[number];

export type Founder = {
  name: string;
  title?: string;
  priorCompanies?: string[];
  sourceQuote?: string;
};

export type Funding = {
  round?: string;
  amountUsd?: number;
  leadInvestor?: string;
  sourceQuote?: string;
};

export type DifferentiationClaim = {
  claim: string;
  sourceQuote?: string;
};

export type KeyMetric = {
  metric: string;
  value: string;
  sourceQuote: string;
};

export type InvestorBrief = {
  pitch?: string;
  productCategory?: string;
  targetMarket?: TargetMarketId;
  monetizationModel?: MonetizationModelId;
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
 * Matches placeholder phrasings the LLM sometimes emits when it can't extract
 * a value (e.g. "Unable to determine from available markdown", "Unknown",
 * "N/A"). Anchored to the start so prose containing the word "unknown" in
 * passing isn't suppressed. Mirrors `PLACEHOLDER_RE` in
 * `scripts/clean-investor-data.py` — keep them in sync.
 */
const PLACEHOLDER_RE =
  /^\s*(unable to (determine|find|extract|identify|locate|verify)|unknown|n\/?a|none(?: (?:available|listed|provided|specified))?|not (available|stated|specified|provided|listed|disclosed|mentioned|clear|applicable|found))\b/i;

export function isPlaceholder(value: string | undefined | null): boolean {
  if (!value) return false;
  return PLACEHOLDER_RE.test(value);
}

/**
 * Strip placeholder strings from a brief so consumers don't have to special-
 * case them at every render site. The cleaner script catches these at seed
 * time, but this is defense-in-depth for any data that lands in Convex
 * through other paths (manual edits, future ingestion, stale rows).
 */
export function sanitizeBrief(
  brief: InvestorBrief | undefined,
): InvestorBrief | undefined {
  if (!brief) return brief;
  const out: InvestorBrief = { ...brief };

  if (isPlaceholder(out.pitch)) out.pitch = undefined;
  if (isPlaceholder(out.productCategory)) out.productCategory = undefined;

  if (out.differentiationClaim && isPlaceholder(out.differentiationClaim.claim)) {
    out.differentiationClaim = undefined;
  }

  if (out.funding) {
    const f = { ...out.funding };
    if (isPlaceholder(f.round)) f.round = undefined;
    if (isPlaceholder(f.leadInvestor)) f.leadInvestor = undefined;
    if (!f.round && f.amountUsd == null && !f.leadInvestor) {
      out.funding = undefined;
    } else {
      out.funding = f;
    }
  }

  return out;
}

/**
 * Returns true when the brief has at least one investor-meaningful field
 * populated. `pagesCrawled`, `flags`, and `extractedAt` are provenance
 * metadata and don't count on their own — a brief with only those is empty
 * for rendering purposes. Runs the brief through `sanitizeBrief` first so a
 * brief whose only content is placeholder strings reads as empty.
 */
export function hasInvestorContent(brief: InvestorBrief | undefined): boolean {
  const b = sanitizeBrief(brief);
  if (!b) return false;
  return Boolean(
    b.pitch ||
      b.productCategory ||
      b.targetMarket ||
      b.monetizationModel ||
      (b.founders && b.founders.length) ||
      (b.notableCustomers && b.notableCustomers.length) ||
      b.funding ||
      b.openRoleCount != null ||
      b.differentiationClaim ||
      (b.keyMetrics && b.keyMetrics.length) ||
      (b.integrations && b.integrations.length),
  );
}
