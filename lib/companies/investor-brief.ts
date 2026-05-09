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
 * Returns true when the brief has at least one investor-meaningful field
 * populated. `pagesCrawled`, `flags`, and `extractedAt` are provenance
 * metadata and don't count on their own — a brief with only those is empty
 * for rendering purposes.
 */
export function hasInvestorContent(brief: InvestorBrief | undefined): boolean {
  if (!brief) return false;
  return Boolean(
    brief.pitch ||
      brief.productCategory ||
      brief.targetMarket ||
      brief.monetizationModel ||
      (brief.founders && brief.founders.length) ||
      (brief.notableCustomers && brief.notableCustomers.length) ||
      brief.funding ||
      brief.openRoleCount != null ||
      brief.differentiationClaim ||
      (brief.keyMetrics && brief.keyMetrics.length) ||
      (brief.integrations && brief.integrations.length),
  );
}
