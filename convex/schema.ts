import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  facetTypeValidator,
  resourceCategoryValidator,
  resourceStatusValidator,
  submissionStatusValidator,
} from './resourceValidators';

/**
 * Validators reused by mutations in this directory. These literal unions
 * mirror lib/companies/taxonomy.ts — keep the two in sync. (When a sector,
 * stage, or employee bucket is added there, add it here too.)
 */
export const sectorValidator = v.union(
  v.literal('b2b-software'),
  v.literal('consumer'),
  v.literal('fintech'),
  v.literal('bio-medical'),
  v.literal('security'),
  v.literal('energy'),
  v.literal('marketplaces'),
  v.literal('other'),
);

export const stageValidator = v.union(
  v.literal('pre-seed'),
  v.literal('seed'),
  v.literal('series-a'),
  v.literal('series-b'),
  v.literal('series-c'),
  v.literal('series-d-plus'),
  v.literal('bootstrapped'),
);

export const employeeCountValidator = v.union(
  v.literal('2-10'),
  v.literal('11-50'),
  v.literal('51-200'),
  v.literal('201-500'),
  v.literal('501-1k'),
  v.literal('1k-5k'),
);

export const targetMarketValidator = v.union(
  v.literal('enterprise'),
  v.literal('mid-market'),
  v.literal('smb'),
  v.literal('consumer'),
  v.literal('developer'),
  v.literal('prosumer'),
);

export const monetizationModelValidator = v.union(
  v.literal('subscription'),
  v.literal('usage-based'),
  v.literal('marketplace'),
  v.literal('transactional'),
  v.literal('freemium'),
  v.literal('contact-sales'),
  v.literal('ads'),
);

export const founderValidator = v.object({
  name: v.string(),
  title: v.optional(v.string()),
  priorCompanies: v.optional(v.array(v.string())),
  sourceQuote: v.optional(v.string()),
});

export const fundingValidator = v.object({
  round: v.optional(v.string()),
  amountUsd: v.optional(v.number()),
  leadInvestor: v.optional(v.string()),
  sourceQuote: v.optional(v.string()),
});

export const differentiationClaimValidator = v.object({
  claim: v.string(),
  sourceQuote: v.optional(v.string()),
});

export const keyMetricValidator = v.object({
  metric: v.string(),
  value: v.string(),
  sourceQuote: v.string(),
});

/**
 * Container for AI-extracted investor-brief data. Nesting these fields under
 * one object both groups the extracted data conceptually and acts as a
 * provenance signal: anything inside `investorBrief` came from the
 * `scripts/find-investor-data.py` pipeline (Claude Haiku 4.5 over crawled
 * website markdown) and may not be 100% accurate. Trusted/curated fields
 * (name, sector, stage, location, etc.) live at the top level.
 */
export const investorBriefValidator = v.object({
  pitch: v.optional(v.string()),
  productCategory: v.optional(v.string()),
  targetMarket: v.optional(targetMarketValidator),
  monetizationModel: v.optional(monetizationModelValidator),
  founders: v.optional(v.array(founderValidator)),
  notableCustomers: v.optional(v.array(v.string())),
  funding: v.optional(fundingValidator),
  openRoleCount: v.optional(v.number()),
  differentiationClaim: v.optional(differentiationClaimValidator),
  keyMetrics: v.optional(v.array(keyMetricValidator)),
  integrations: v.optional(v.array(v.string())),
  pagesCrawled: v.optional(v.array(v.string())),
  flags: v.optional(v.array(v.string())),
  extractedAt: v.optional(v.number()),
});

export const hiringStatusValidator = v.union(
  v.literal('actively'),
  v.literal('occasionally'),
  v.literal('not'),
  v.literal('unknown'),
);

export const companyStatusValidator = v.union(
  v.literal('pending'),
  v.literal('published'),
  v.literal('archived'),
);

export const locationValidator = v.object({
  rawAddress: v.string(),
  city: v.optional(v.string()),
  county: v.optional(v.string()),
  state: v.optional(v.string()),
  lng: v.optional(v.number()),
  lat: v.optional(v.number()),
});

export default defineSchema({
  /** State programs & partner resources — full-text searchable + facets. */
  resources: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.string(),
    url: v.string(),
    contactEmail: v.optional(v.string()),
    sourceId: v.optional(v.string()),
    /** Denormalized tags from CSV/API for display — facet rows power indexed filters. */
    communities: v.array(v.string()),
    industries: v.array(v.string()),
    locations: v.array(v.string()),
    /** Curated, single-value category. Drives section grouping on /resources. */
    category: resourceCategoryValidator,
    /** Free-form-ish secondary descriptors. */
    tags: v.array(v.string()),
    stageTags: v.array(v.string()),
    searchText: v.string(),
    status: resourceStatusValidator,
    submissionId: v.optional(v.id('resourceSubmissions')),
    lastSyncedAt: v.optional(v.number()),
    embeddingVersion: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_sourceId', ['sourceId'])
    .index('by_category', ['category', 'status'])
    .searchIndex('search_resources', {
      searchField: 'searchText',
      filterFields: ['status'],
      staged: false,
    }),

  resourceFacets: defineTable({
    resourceId: v.id('resources'),
    facetType: facetTypeValidator,
    value: v.string(),
    status: resourceStatusValidator,
  })
    .index('by_resourceId', ['resourceId'])
    .index('by_facetType_and_status', ['facetType', 'status'])
    .index('by_facetType_and_value_and_status', ['facetType', 'value', 'status']),

  resourceEmbeddings: defineTable({
    resourceId: v.id('resources'),
    embedding: v.array(v.float64()),
    embeddingModel: v.string(),
    status: resourceStatusValidator,
  })
    .index('by_resourceId', ['resourceId'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['status'],
    }),

  /** Public proposals — moderated in admin before publish. */
  resourceSubmissions: defineTable({
    title: v.string(),
    description: v.string(),
    url: v.string(),
    submitterName: v.string(),
    submitterEmail: v.string(),
    organization: v.optional(v.string()),
    suggestedCommunities: v.array(v.string()),
    suggestedIndustries: v.array(v.string()),
    suggestedLocations: v.array(v.string()),
    suggestedTopics: v.array(v.string()),
    suggestedTags: v.optional(v.array(v.string())),
    suggestedCategory: v.optional(resourceCategoryValidator),
    notes: v.optional(v.string()),
    status: submissionStatusValidator,
    moderatorNote: v.optional(v.string()),
    mergedIntoResourceId: v.optional(v.id('resources')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_status', ['status'])
    .index('by_submitterEmail', ['submitterEmail']),

  resourceSubmissionEvents: defineTable({
    submissionId: v.id('resourceSubmissions'),
    actorTokenIdentifier: v.optional(v.string()),
    action: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_submissionId', ['submissionId']),

  companies: defineTable({
    // Identity
    name: v.string(),
    slug: v.string(),

    // Public profile
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    logoUrl: v.optional(v.string()),

    // Concatenation of name + website + description, kept in sync on every
    // write so a single search index can match across the three. Optional
    // for pre-backfill rows; new writes always populate it.
    searchText: v.optional(v.string()),

    // Classification
    sector: sectorValidator,
    stage: v.optional(stageValidator),
    employeeCount: v.optional(employeeCountValidator),

    // Location
    location: locationValidator,

    // AI-extracted investor brief. Nested under one object so the path
    // itself signals provenance — anything inside is best-effort, not curated.
    investorBrief: v.optional(investorBriefValidator),

    // Spec-required fields, populated via self-service after seed
    yearFounded: v.optional(v.number()),
    hiringStatus: hiringStatusValidator,
    jobPostings: v.array(
      v.object({
        title: v.string(),
        link: v.string(),
        department: v.optional(v.string()),
      }),
    ),
    photos: v.array(v.id('_storage')),

    // Workflow / governance
    status: companyStatusValidator,
    claimedBy: v.optional(v.string()), // becomes v.id('users') when auth lands
    lastEditedAt: v.number(),
    diffLog: v.array(
      v.object({
        userId: v.optional(v.string()),
        timestamp: v.number(),
        changes: v.string(),
      }),
    ),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_sector', ['sector'])
    // Powers the map's text search box. `status` is a filter field so we can
    // scope to published rows inside the search query.
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['status'],
    }),
});
