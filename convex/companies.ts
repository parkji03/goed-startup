import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import {
  sectorValidator,
  stageValidator,
  employeeCountValidator,
  locationValidator,
  investorBriefValidator,
  hiringStatusValidator,
} from './schema';

/**
 * Args shape for an inbound job listing during seed. Kept as a const so the
 * seedOne mutation and the listings-replace helper share the same validator.
 */
const seedJobListingValidator = v.object({
  source: v.union(v.literal('linkedin'), v.literal('manual')),
  externalId: v.optional(v.string()),
  title: v.string(),
  url: v.string(),
  department: v.optional(v.string()),
  location: v.optional(v.string()),
  postedAt: v.optional(v.number()),
});

/**
 * Concatenate the user-visible text fields into a single string indexed by
 * the `search_text` search index. Joining keeps the schema to one search
 * index instead of three (name + website + description + listing titles),
 * at the cost of losing per-field weighting — fine for our small corpus.
 *
 * Listing titles are included so a search like "engineer" surfaces every
 * company with an open engineering role. Any code path that mutates a
 * company's listings must keep this string in sync (today only `seedOne`
 * writes listings, and it rebuilds searchText every run).
 */
function buildSearchText(
  name: string,
  website?: string,
  description?: string,
  listingTitles?: string[],
): string {
  const titles = listingTitles?.length ? listingTitles.join(' ') : undefined;
  return [name, website, description, titles]
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
    cities: v.optional(v.array(v.string())),
    /**
     * Each entry is an actual `hiringStatus` value (true / false /
     * 'unknown'). The hook layer translates UI/URL filter IDs
     * ('hiring' / 'not-hiring' / 'unknown') to these before calling, so
     * Convex never sees the URL representation.
     */
    hiringStatuses: v.optional(v.array(hiringStatusValidator)),
  },
  handler: async (
    ctx,
    { q, sectors, stages, employeeCounts, cities, hiringStatuses },
  ) => {
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
    // Cities are free-form strings rather than a closed enum, so match
    // case-insensitively to avoid drifting if the seed data ever has
    // mixed casing.
    const citySet = cities && cities.length
      ? new Set(cities.map((c) => c.trim().toLowerCase()))
      : null;
    // Boolean / 'unknown' values stored on the doc; legacy rows that
    // never got a hiringStatus written are treated as 'unknown' below.
    const hiringSet = hiringStatuses && hiringStatuses.length
      ? new Set<boolean | 'unknown'>(hiringStatuses)
      : null;

    const filtered = rows
      .filter((c) => c.location.lat != null && c.location.lng != null)
      .filter((c) => !sectorSet || sectorSet.has(c.sector))
      .filter((c) => !stageSet || (c.stage != null && stageSet.has(c.stage)))
      .filter(
        (c) =>
          !employeeSet ||
          (c.employeeCount != null && employeeSet.has(c.employeeCount)),
      )
      .filter(
        (c) =>
          !citySet ||
          (c.location.city != null &&
            citySet.has(c.location.city.trim().toLowerCase())),
      )
      .filter((c) => !hiringSet || hiringSet.has(c.hiringStatus ?? 'unknown'));

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
        investorBrief: c.investorBrief,
        // Hiring snapshot — drives the per-card hiring indicator. Falls
        // back to 'unknown' for legacy rows that never went through the
        // LinkedIn-aware seed.
        hiringStatus: c.hiringStatus ?? ('unknown' as const),
        openListingsCount: c.openListingsCount ?? 0,
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
 * Cities (with company counts) for the City filter chip on the map. Computed
 * over the full published set, NOT the currently-filtered set, so the
 * dropdown options stay stable as the user toggles other filters. Sorted by
 * count desc so the busiest cities are at the top — investors usually scan
 * the dense markets first.
 *
 * The filter chip uses `name` (display label) and `id` (URL-safe key, just
 * the lowercase city name) to drive the multi-select.
 */
export const cityList = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('companies')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(1000);
    const counts = new Map<string, { display: string; count: number }>();
    for (const r of rows) {
      const city = r.location.city?.trim();
      if (!city) continue;
      // Skip rows the map can't actually plot — they'd never show up in
      // the result list, so a city with only un-geocoded entries would
      // be a dead-end filter.
      if (r.location.lat == null || r.location.lng == null) continue;
      const key = city.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { display: city, count: 1 });
    }
    return Array.from(counts.entries())
      .map(([key, { display, count }]) => ({ key, display, count }))
      .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));
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
 * One-shot: rebuild `searchText` for every company. Useful after changing
 * the buildSearchText shape (e.g. adding listing titles) without re-running
 * the full CSV seed. Idempotent — only patches rows whose value actually
 * changed.
 *
 *   npx convex run companies:backfillSearchText
 */
export const backfillSearchText = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('companies').collect();
    let written = 0;
    for (const row of rows) {
      const listings = await ctx.db
        .query('companyJobPostings')
        .withIndex('by_companyId', (q) => q.eq('companyId', row._id))
        .collect();
      const next = buildSearchText(
        row.name,
        row.website,
        row.description,
        listings.map((l) => l.title),
      );
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
 * Curatorial override for `investorBrief.funding`. The brief is AI-extracted
 * and sometimes wrong (mismatched round, missing follow-on rounds, wrong
 * lead investor). Use this to replace the funding subfield for one company
 * by slug without disturbing the rest of the brief.
 *
 * Pass `sourceQuote: undefined` (the default) to mark the override as
 * curated — it then doesn't show up in the bottom Sources audit trail,
 * which is correct since the data no longer traces back to a website crawl.
 *
 * Run with:
 *   npx convex run companies:overrideInvestorFunding '{"slug":"jobnimbus","funding":{...}}'
 */
export const overrideInvestorFunding = mutation({
  args: {
    slug: v.string(),
    funding: v.object({
      round: v.optional(v.string()),
      amountUsd: v.optional(v.number()),
      leadInvestor: v.optional(v.string()),
      sourceQuote: v.optional(v.string()),
    }),
  },
  handler: async (ctx, { slug, funding }) => {
    const row = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!row) {
      throw new Error(`No company found with slug "${slug}"`);
    }
    const nextBrief = { ...(row.investorBrief ?? {}), funding };
    await ctx.db.patch(row._id, {
      investorBrief: nextBrief,
      lastEditedAt: Date.now(),
    });
    return { _id: row._id, slug, funding };
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

    /**
     * Hiring snapshot derived from the LinkedIn scrape. The seed script
     * computes this from `linkedin-hiring-data.json`:
     *   has-linkedin + listings → true
     *   has-linkedin + no listings → false
     *   no linkedin / unknown → 'unknown'
     */
    hiringStatus: v.optional(hiringStatusValidator),
    /** ms epoch when the LinkedIn scrape that produced `hiringStatus` ran. */
    linkedinSyncedAt: v.optional(v.number()),
    /**
     * Replace-all set of job listings for this company. Provided ⇒ wipe
     * the existing rows in `companyJobPostings` for this company and
     * insert these. Omitted ⇒ leave existing listings alone (lets you
     * re-seed company metadata without churning postings).
     */
    jobListings: v.optional(v.array(seedJobListingValidator)),
  },
  handler: async (ctx, args) => {
    const { jobListings, ...companyArgs } = args;
    const existing = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', companyArgs.slug))
      .unique();

    const now = Date.now();
    const writePayload = {
      ...companyArgs,
      searchText: buildSearchText(
        companyArgs.name,
        companyArgs.website,
        companyArgs.description,
        jobListings?.map((l) => l.title),
      ),
      // Default to 'unknown' when the seed didn't compute one (e.g. for a
      // partial run that skipped LinkedIn).
      hiringStatus: companyArgs.hiringStatus ?? ('unknown' as const),
      // Denormalized listings count — only written when the caller passes
      // a fresh listings batch, otherwise we'd zero out on a metadata-only
      // re-seed. `[]` is fine on intent ("we checked, no listings") and
      // drops the count to 0.
      ...(jobListings !== undefined
        ? { openListingsCount: jobListings.length }
        : {}),
      // Drain the legacy `jobPostings` array field on every write — once
      // every row passes through this path, the field can be dropped from
      // the schema entirely. Convex treats `undefined` in a patch as
      // "remove this field".
      jobPostings: undefined,
      photos: [] as never[],
      status: 'published' as const,
      lastEditedAt: now,
      diffLog: [] as { userId?: string; timestamp: number; changes: string }[],
    };

    let companyId;
    let action: 'inserted' | 'updated';
    if (existing) {
      await ctx.db.patch(existing._id, writePayload);
      companyId = existing._id;
      action = 'updated';
    } else {
      companyId = await ctx.db.insert('companies', writePayload);
      action = 'inserted';
    }

    // Replace job listings atomically with the company write. Bounded
    // delete: a single company has at most a handful of LinkedIn postings,
    // well under transaction limits.
    if (jobListings !== undefined) {
      const stale = await ctx.db
        .query('companyJobPostings')
        .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
        .collect();
      for (const r of stale) await ctx.db.delete(r._id);
      const scrapedAt = companyArgs.linkedinSyncedAt ?? now;
      for (const l of jobListings) {
        await ctx.db.insert('companyJobPostings', {
          ...l,
          companyId,
          scrapedAt,
        });
      }
    }

    return {
      _id: companyId,
      action,
      listingsReplaced: jobListings?.length ?? 0,
    };
  },
});

/**
 * All open listings for a company, newest-first. Driven by the index that
 * orders `(companyId, postedAt)` so no in-memory sort is needed; rows
 * without `postedAt` sort last (Convex sorts undefined as null).
 */
export const listingsForCompany = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) => {
    return await ctx.db
      .query('companyJobPostings')
      .withIndex('by_companyId_and_postedAt', (q) =>
        q.eq('companyId', companyId),
      )
      .order('desc')
      .take(50);
  },
});

/**
 * Every open listing across the corpus, with the parent company's display
 * fields joined in. Powers a global jobs view; stays cheap because the
 * corpus is small (low hundreds of listings) and the company set is read
 * once per call rather than per-row.
 *
 * Sort: newest-first by `postedAt` (undefined sorts last). No global
 * `by_postedAt` index because at this scale a 1000-row in-memory sort
 * costs nothing — add the index if the table ever exceeds ~5k rows.
 */
export const allListings = query({
  args: {},
  handler: async (ctx) => {
    // Generous bound — well above the current 304-row corpus and within
    // Convex's per-query limits.
    const LISTINGS_CAP = 1000;
    const listings = await ctx.db
      .query('companyJobPostings')
      .take(LISTINGS_CAP);

    // Batch the company lookups so we hit each parent doc once even when
    // a company has many listings.
    const uniqueCompanyIds = Array.from(
      new Set(listings.map((l) => l.companyId)),
    );
    const companyDocs = await Promise.all(
      uniqueCompanyIds.map((id) => ctx.db.get(id)),
    );
    const byId = new Map(
      companyDocs
        .filter((c): c is NonNullable<typeof c> => c != null)
        .map((c) => [c._id, c] as const),
    );

    return listings
      .map((l) => {
        const c = byId.get(l.companyId);
        if (!c || c.status !== 'published') return null;
        return {
          _id: l._id,
          title: l.title,
          url: l.url,
          source: l.source,
          department: l.department,
          location: l.location,
          postedAt: l.postedAt,
          scrapedAt: l.scrapedAt,
          company: {
            _id: c._id,
            name: c.name,
            slug: c.slug,
            sector: c.sector,
            city: c.location.city,
            website: c.website,
          },
        };
      })
      .filter(<T,>(x: T | null): x is T => x !== null)
      .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0));
  },
});

/**
 * One-shot backfill for rows seeded before `hiringStatus` became required.
 * Patches in `'unknown'` so schema validation passes. Idempotent — only
 * writes when the field is missing. Re-running the LinkedIn-driven seed
 * supersedes this for any row it touches.
 */
export const backfillRequiredFields = mutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('companies').collect();
    let patched = 0;
    for (const row of rows) {
      if (row.hiringStatus === undefined) {
        await ctx.db.patch(row._id, { hiringStatus: 'unknown' });
        patched++;
      }
    }
    return { scanned: rows.length, patched };
  },
});
