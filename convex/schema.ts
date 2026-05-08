import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

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
