import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  sectorValidator,
  stageValidator,
  employeeCountValidator,
  locationValidator,
} from './schema';

/**
 * Concatenate the user-visible text fields into a single string indexed by
 * the `search_text` search index. Joining keeps the schema to one search
 * index instead of three (name + website + description), at the cost of
 * losing per-field weighting — fine for our small corpus.
 */
function buildSearchText(
  name: string,
  website?: string,
  description?: string,
): string {
  return [name, website, description]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
}

/**
 * Public list of all published companies — used by the map and any other
 * surface that needs the full ecosystem view.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('companies')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect();
  },
});

/**
 * Lean projection used by the map. Returns only the fields the map source
 * needs (id, name, slug, sector, lat/lng) and skips rows without coordinates.
 * Keeps the GeoJSON payload tight and the GPU layer happy.
 */
export const listForMap = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('companies')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .collect();

    return rows
      .filter((c) => c.location.lat != null && c.location.lng != null)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        sector: c.sector,
        website: c.website,
        lng: c.location.lng!,
        lat: c.location.lat!,
      }));
  },
});

/**
 * Search + filter projection for the map. Same shape as `listForMap`, but
 * with optional fuzzy text search and multi-value categorical filters
 * applied. Categorical filtering happens in memory after the index lookup —
 * Convex's search/index APIs only express equality on a single value, and
 * our corpus is small enough that an in-memory pass is fine.
 *
 * Empty/undefined arrays mean "no constraint on that dimension".
 */
export const searchForMap = query({
  args: {
    q: v.optional(v.string()),
    sectors: v.optional(v.array(sectorValidator)),
    stages: v.optional(v.array(stageValidator)),
    employeeCounts: v.optional(v.array(employeeCountValidator)),
  },
  handler: async (ctx, { q, sectors, stages, employeeCounts }) => {
    const trimmed = q?.trim() ?? '';

    // Cap reads at a generous bound so the map can render the entire
    // published set today (220-ish rows) and absorb growth without a
    // schema change. Stays well within Convex's per-query limits.
    const ROW_CAP = 1000;
    const rows = trimmed.length > 0
      ? await ctx.db
          .query('companies')
          .withSearchIndex('search_text', (qb) =>
            qb.search('searchText', trimmed).eq('status', 'published'),
          )
          .take(ROW_CAP)
      : await ctx.db
          .query('companies')
          .withIndex('by_status', (qb) => qb.eq('status', 'published'))
          .take(ROW_CAP);

    const sectorSet = sectors && sectors.length ? new Set(sectors) : null;
    const stageSet = stages && stages.length ? new Set(stages) : null;
    const employeeSet = employeeCounts && employeeCounts.length
      ? new Set(employeeCounts)
      : null;

    return rows
      .filter((c) => c.location.lat != null && c.location.lng != null)
      .filter((c) => !sectorSet || sectorSet.has(c.sector))
      .filter((c) => !stageSet || (c.stage != null && stageSet.has(c.stage)))
      .filter(
        (c) =>
          !employeeSet ||
          (c.employeeCount != null && employeeSet.has(c.employeeCount)),
      )
      .map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        sector: c.sector,
        website: c.website,
        lng: c.location.lng!,
        lat: c.location.lat!,
      }));
  },
});

/**
 * Total count of published companies that the map can plot — used by the
 * filter panel to show "Showing X of Y". Cheap (no payload, just a count)
 * and unaffected by the active filters, so the denominator stays stable.
 */
export const mapTotalCount = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('companies')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(1000);
    return rows.filter(
      (c) => c.location.lat != null && c.location.lng != null,
    ).length;
  },
});

/**
 * Single company by slug — for company profile pages.
 */
export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
  },
});

/**
 * One-shot: populate `searchText` on every company that doesn't have it yet.
 * Run after the schema migration with:
 *   npx convex run companies:backfillSearchText
 * Idempotent — re-running rewrites the same value (cheap no-op patches).
 */
export const backfillSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('companies').collect();
    let written = 0;
    for (const row of rows) {
      const next = buildSearchText(row.name, row.website, row.description);
      if (row.searchText !== next) {
        await ctx.db.patch(row._id, { searchText: next });
        written++;
      }
    }
    return { scanned: rows.length, written };
  },
});

/**
 * One-off cleanup: clear `logoUrl` from every company. We render logos via
 * logo.dev at request time using the company's domain, so the stored URLs
 * are no longer needed. Run with: `npx convex run companies:clearLogoUrls`.
 * Safe to leave in place — it's a no-op once the field is unset everywhere.
 */
export const clearLogoUrls = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('companies').collect();
    let cleared = 0;
    for (const row of rows) {
      if (row.logoUrl !== undefined) {
        await ctx.db.patch(row._id, { logoUrl: undefined });
        cleared++;
      }
    }
    return { scanned: rows.length, cleared };
  },
});

/**
 * Idempotent upsert by slug. Called by scripts/seed-companies.ts during
 * initial data loading and re-runs. Re-running on an existing slug patches
 * the row in place without creating duplicates.
 *
 * Public mutation for now (hackathon convenience). Lock down or move to
 * `internalMutation` + admin-key invocation before production.
 */
export const seedOne = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    website: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    sector: sectorValidator,
    stage: v.optional(stageValidator),
    employeeCount: v.optional(employeeCountValidator),
    yearFounded: v.optional(v.number()),
    location: locationValidator,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();

    const now = Date.now();
    const writePayload = {
      ...args,
      searchText: buildSearchText(args.name, args.website, args.description),
      hiringStatus: 'unknown' as const,
      jobPostings: [] as { title: string; link: string; department?: string }[],
      photos: [] as never[],
      status: 'published' as const,
      lastEditedAt: now,
      diffLog: [] as { userId?: string; timestamp: number; changes: string }[],
    };

    if (existing) {
      await ctx.db.patch(existing._id, writePayload);
      return { _id: existing._id, action: 'updated' as const };
    }

    const _id = await ctx.db.insert('companies', writePayload);
    return { _id, action: 'inserted' as const };
  },
});
