import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  facetTypeValidator,
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
    topics: v.array(v.string()),
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

    // Classification
    sector: sectorValidator,
    stage: v.optional(stageValidator),
    employeeCount: v.optional(employeeCountValidator),

    // Location
    location: locationValidator,

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
    .index('by_sector', ['sector']),
});
