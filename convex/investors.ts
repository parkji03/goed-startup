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
 * Search + projection for the map (and the list panel beside it). Honors a
 * text search box plus four investor-specific facets (type, stage,
 * cheque-size range, countries-of-investment). The hook layer translates
 * filter IDs → raw OpenVC strings before calling, so this query operates
 * purely on the doc shape.
 *
 * Filters out rows without lat/lng so the geojson contract matches companies
 * (a row in the result ⇒ plottable). The full corpus is ~2.5k, well within
 * Convex's per-query limits even when collected in one shot.
 */
export const searchForMap = query({
  args: {
    q: v.optional(v.string()),
    /** Raw OpenVC `investorType` strings to match (OR within facet). */
    types: v.optional(v.array(v.string())),
    /** Raw OpenVC stage tokens (e.g. "1. Idea or Patent"); OR within facet. */
    stages: v.optional(v.array(v.string())),
    /**
     * Cheque-size bucket ranges. An investor matches if their
     * [firstChequeMin, firstChequeMax] interval overlaps any range.
     * Open-ended buckets use Number.MAX_SAFE_INTEGER for `max` (Infinity
     * doesn't round-trip cleanly through JSON).
     */
    chequeRanges: v.optional(
      v.array(v.object({ min: v.number(), max: v.number() })),
    ),
    /** Country names from OpenVC `countriesOfInvestment` arrays; OR within. */
    countries: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    { q, types, stages, chequeRanges, countries },
  ) => {
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

    const typeSet = types && types.length ? new Set(types) : null;
    const stageSet = stages && stages.length ? new Set(stages) : null;
    const countrySet =
      countries && countries.length ? new Set(countries) : null;
    const ranges = chequeRanges && chequeRanges.length ? chequeRanges : null;

    const filtered = rows
      .filter((i) => i.location?.lat != null && i.location?.lng != null)
      .filter(
        (i) => !typeSet || (i.investorType != null && typeSet.has(i.investorType)),
      )
      .filter(
        (i) => !stageSet || i.stagesOfInvestment.some((s) => stageSet.has(s)),
      )
      .filter(
        (i) =>
          !countrySet || i.countriesOfInvestment.some((c) => countrySet.has(c)),
      )
      .filter((i) => {
        if (!ranges) return true;
        // Investor with no cheque info at all can't be matched against a
        // bucket — exclude rather than guess. The other facets get the
        // benefit of the doubt because they have explicit "Other" /
        // empty-array semantics.
        if (i.firstChequeMin == null && i.firstChequeMax == null) return false;
        const lo = i.firstChequeMin ?? 0;
        const hi = i.firstChequeMax ?? Number.MAX_SAFE_INTEGER;
        return ranges.some((r) => lo <= r.max && hi >= r.min);
      });

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
 * Distinct countries-of-investment with counts, for the "Invests in" filter
 * chip. Computed over the full geocoded corpus (not the currently-filtered
 * set) so the dropdown stays stable as filters compose. Sorted by count
 * desc — the broadly-targeted countries (e.g., "USA") sit at the top where
 * a Utah founder is most likely to scan first.
 *
 * Returns the same `{ key, display, count }` shape as `companies.cityList`
 * so the FilterBar can reuse the existing chip-options pattern. Country
 * names from OpenVC are display-ready strings, so `key === display`.
 */
export const countryList = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('investors').take(5000);
    const counts = new Map<string, number>();
    for (const r of rows) {
      // Skip ungeocoded rows — they can't appear on the map, so showing
      // them in the filter dropdown would be a dead-end.
      if (r.location?.lat == null || r.location?.lng == null) continue;
      for (const raw of r.countriesOfInvestment) {
        const key = raw.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([key, count]) => ({ key, display: key, count }))
      .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
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
