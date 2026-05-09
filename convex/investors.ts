import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { investorLocationValidator } from './schema';

function buildSearchText(
  name: string,
  thesis?: string,
  globalHq?: string,
  countries?: string[],
): string {
  return [name, thesis, globalHq, countries?.join(' ')]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
}

/**
 * All investors, used by any future investor-facing view. Returns rows in
 * insertion order; callers that need pagination should switch to a
 * `.paginate()` once the corpus warrants it (~2.5k rows is fine to collect).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('investors').collect();
  },
});

/**
 * Search + projection for the map (and the list panel beside it). Mirrors
 * `companies.searchForMap` but with a much smaller filter surface — investors
 * don't share the company taxonomy (no sector/stage/employee facets), so for
 * now this only honors the text search box.
 *
 * Filters out rows without lat/lng so the geojson contract matches companies
 * (a row in the result ⇒ plottable). The full corpus is ~2.5k, well within
 * Convex's per-query limits even when collected in one shot.
 */
export const searchForMap = query({
  args: {
    q: v.optional(v.string()),
  },
  handler: async (ctx, { q }) => {
    const trimmed = q?.trim() ?? '';
    // Convex's search index caps at ~1024 fetched documents per query
    // (the index maintains a fixed scan budget). Anything beyond errors
    // with "Search query scanned too many documents". 1000 leaves a
    // small safety margin and is plenty: a search returning 1000+ hits
    // is functionally unfiltered from a UX standpoint anyway.
    const SEARCH_CAP = 1000;
    // The unfiltered path doesn't go through the search index, so it
    // can pull the whole corpus. 5000 covers today's ~2.5k OpenVC rows
    // plus headroom for re-imports without bumping the schema.
    const FULL_CAP = 5000;

    const rows =
      trimmed.length > 0
        ? await ctx.db
            .query('investors')
            .withSearchIndex('search_text', (qb) =>
              qb.search('searchText', trimmed),
            )
            .take(SEARCH_CAP)
        : await ctx.db.query('investors').take(FULL_CAP);

    const filtered = rows.filter(
      (i) => i.location?.lat != null && i.location?.lng != null,
    );

    // Re-rank so name matches surface above thesis-only matches. Same trick
    // as companies.searchForMap.
    const ranked =
      trimmed.length > 0
        ? (() => {
            const needle = trimmed.toLowerCase();
            const nameHits: typeof filtered = [];
            const rest: typeof filtered = [];
            for (const r of filtered) {
              if (r.name.toLowerCase().includes(needle)) nameHits.push(r);
              else rest.push(r);
            }
            return [...nameHits, ...rest];
          })()
        : filtered;

    return ranked.map((i) => ({
      _id: i._id,
      name: i.name,
      slug: i.slug,
      website: i.website,
      globalHq: i.globalHq,
      location: i.location
        ? {
            rawAddress: i.location.rawAddress,
            city: i.location.city,
            region: i.location.region,
            country: i.location.country,
          }
        : undefined,
      lng: i.location!.lng!,
      lat: i.location!.lat!,
      investorType: i.investorType,
      investmentThesis: i.investmentThesis,
      firstChequeMin: i.firstChequeMin,
      firstChequeMax: i.firstChequeMax,
      countriesOfInvestment: i.countriesOfInvestment,
      stagesOfInvestment: i.stagesOfInvestment,
    }));
  },
});

/**
 * Total mappable investors — denominator for "Showing X of Y" once the type
 * toggle exposes investors in the list. Counts only geocoded rows so it
 * matches what the map can actually plot.
 */
export const mapTotalCount = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('investors').take(5000);
    return rows.filter(
      (i) => i.location?.lat != null && i.location?.lng != null,
    ).length;
  },
});

/**
 * Single investor by slug — for investor profile pages or deep links.
 */
export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query('investors')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
  },
});

/**
 * Idempotent upsert by slug. Called by scripts/seed-investors.ts during the
 * OpenVC seed. Re-running on an existing slug patches in place — safe to
 * re-run after upstream edits.
 *
 * Public mutation for now (hackathon convenience). Lock down or move to
 * `internalMutation` + admin-key invocation before production.
 */
export const seedOne = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    website: v.optional(v.string()),
    globalHq: v.optional(v.string()),
    location: v.optional(investorLocationValidator),
    countriesOfInvestment: v.array(v.string()),
    stagesOfInvestment: v.array(v.string()),
    investmentThesis: v.optional(v.string()),
    investorType: v.optional(v.string()),
    firstChequeMin: v.optional(v.number()),
    firstChequeMax: v.optional(v.number()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('investors')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();

    const now = Date.now();
    const writePayload = {
      ...args,
      searchText: buildSearchText(
        args.name,
        args.investmentThesis,
        args.globalHq,
        args.countriesOfInvestment,
      ),
      sourceImportedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, writePayload);
      return { _id: existing._id, action: 'updated' as const };
    }
    const _id = await ctx.db.insert('investors', writePayload);
    return { _id, action: 'inserted' as const };
  },
});
