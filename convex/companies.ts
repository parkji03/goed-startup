import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  sectorValidator,
  stageValidator,
  employeeCountValidator,
  locationValidator,
} from './schema';

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
