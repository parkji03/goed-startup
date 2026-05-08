import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  sectorValidator,
  stageValidator,
  employeeCountValidator,
  locationValidator,
  investorBriefValidator,
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
 * Search + filter projection for the map and the results sidebar. The map
 * only needs id/name/slug/sector/website/lat-lng; the sidebar's company
 * cards consume the richer fields (description, linkedin, stage, employee
 * count, founded year, full address). Returning everything in one shot
 * keeps it to a single Convex subscription shared by both views.
 *
 * Categorical filtering happens in memory after the index lookup —
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

    const filtered = rows
      .filter((c) => c.location.lat != null && c.location.lng != null)
      .filter((c) => !sectorSet || sectorSet.has(c.sector))
      .filter((c) => !stageSet || (c.stage != null && stageSet.has(c.stage)))
      .filter(
        (c) =>
          !employeeSet ||
          (c.employeeCount != null && employeeSet.has(c.employeeCount)),
      );

    // Re-rank so company-name matches surface above website/description-only
    // matches. Convex's BM25 over the combined searchText weights all three
    // fields equally; this pass restores name primacy without a schema change.
    const ranked = trimmed.length > 0
      ? (() => {
          const needle = trimmed.toLowerCase();
          const nameHits: typeof filtered = [];
          const rest: typeof filtered = [];
          for (const c of filtered) {
            if (c.name.toLowerCase().includes(needle)) nameHits.push(c);
            else rest.push(c);
          }
          return [...nameHits, ...rest];
        })()
      : filtered;

    return ranked
      .map((c) => ({
        _id: c._id,
        name: c.name,
        slug: c.slug,
        sector: c.sector,
        stage: c.stage,
        employeeCount: c.employeeCount,
        yearFounded: c.yearFounded,
        description: c.description,
        website: c.website,
        linkedin: c.linkedin,
        location: {
          rawAddress: c.location.rawAddress,
          city: c.location.city,
          county: c.location.county,
          state: c.location.state,
        },
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
 * One-off cleanup: clear the legacy flat investor-brief fields ahead of the
 * `investorBrief` nested-object refactor. The schema cannot drop these fields
 * while existing rows still carry them, so this runs first. Idempotent —
 * once flat fields are gone everywhere, this is a no-op.
 *
 * Run with: `npx convex run companies:clearFlatInvestorFields`
 */
export const clearFlatInvestorFields = mutation({
  args: {},
  handler: async (ctx) => {
    const FLAT_FIELDS = [
      'pitch',
      'productCategory',
      'targetMarket',
      'monetizationModel',
      'founders',
      'notableCustomers',
      'funding',
      'openRoleCount',
      'differentiationClaim',
      'keyMetrics',
      'integrations',
      'investorDataPagesCrawled',
      'investorDataFlags',
    ] as const;
    const rows = await ctx.db.query('companies').collect();
    let cleared = 0;
    for (const row of rows) {
      const patch: Record<string, undefined> = {};
      let touched = false;
      for (const f of FLAT_FIELDS) {
        if ((row as Record<string, unknown>)[f] !== undefined) {
          patch[f] = undefined;
          touched = true;
        }
      }
      if (touched) {
        await ctx.db.patch(row._id, patch);
        cleared++;
      }
    }
    return { scanned: rows.length, cleared };
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

    // Investor brief — AI-extracted from website crawls. Best-effort, not curated.
    investorBrief: v.optional(investorBriefValidator),
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
