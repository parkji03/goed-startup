import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { query } from './_generated/server';
import { RESOURCE_CATEGORY_KEYS, type ResourceCategoryKey } from '../lib/resources/categories';
import { founderProfileValidator, clampFounderProfileForConvex } from './founderProfile';
import { pickLocalizedResourceText, type ResourceLocale } from './lib/resourceHelpers';
import { scoreResourceForProfile } from './lib/matchResources';
import { facetTypeValidator } from './resourceValidators';

/**
 * Optional locale arg shared by every resource read path. Defaults to `en`
 * when omitted. Spanish variants fall back to English when a row hasn't
 * been translated yet.
 */
const localeValidator = v.optional(v.union(v.literal('en'), v.literal('es')));

function resolveLocale(locale: ResourceLocale | undefined): ResourceLocale {
  return locale ?? 'en';
}

function projectReco(
  rows: Array<{
    doc: {
      _id: unknown;
      title: string;
      slug: string;
      description: string;
      url: string;
      category: ResourceCategoryKey;
      tags: string[];
      stageTags: string[];
      industries: string[];
      communities: string[];
    };
    score: number;
  }>,
) {
  return rows.map(({ doc, score }) => ({
    _id: doc._id,
    title: doc.title,
    slug: doc.slug,
    description: doc.description,
    url: doc.url,
    category: doc.category,
    tags: doc.tags,
    stageTags: doc.stageTags,
    industries: doc.industries,
    communities: doc.communities,
    matchScore: score,
    reason:
      score > 0
        ? 'Matches your quiz answers (category, industry, location, or founder community).'
        : 'Popular starting point — add more quiz detail to personalize further.',
  }));
}

/**
 * Lightweight projection for sitemap generation. Returns just slug + last
 * sync time so SSG/sitemap builds avoid pulling the full document.
 */
export const sitemapEntries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(5000);
    return rows.map((r) => ({
      slug: r.slug,
      lastModified: r.lastSyncedAt ?? r._creationTime,
    }));
  },
});

export const search = query({
  args: {
    query: v.string(),
    limit: v.number(),
    locale: localeValidator,
  },
  handler: async (ctx, { query: q, limit, locale }) => {
    const lim = Math.min(Math.max(limit, 1), 25);
    if (!q.trim()) {
      return [];
    }
    const loc = resolveLocale(locale);
    const hits = await ctx.db
      .query('resources')
      .withSearchIndex('search_resources', (s) => s.search('searchText', q).eq('status', 'published'))
      .take(lim);
    return hits.map((r) => ({ ...r, ...pickLocalizedResourceText(r, loc) }));
  },
});

export const listPublishedPage = query({
  args: { paginationOpts: paginationOptsValidator, locale: localeValidator },
  handler: async (ctx, { paginationOpts, locale }) => {
    const loc = resolveLocale(locale);
    const page = await ctx.db
      .query('resources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('asc')
      .paginate(paginationOpts);

    return {
      ...page,
      page: page.page.map((r) => {
        const localized = pickLocalizedResourceText(r, loc);
        return {
          _id: r._id,
          title: localized.title,
          slug: r.slug,
          description: localized.description,
          url: r.url,
          category: r.category,
          tags: r.tags ?? [],
          stageTags: r.stageTags,
          industries: r.industries,
          communities: r.communities,
        };
      }),
    };
  },
});

export const bySlug = query({
  args: { slug: v.string(), locale: localeValidator },
  handler: async (ctx, { slug, locale }) => {
    const loc = resolveLocale(locale);
    const rows = await ctx.db
      .query('resources')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .take(32);
    const published = rows.filter((r) => r.status === 'published');
    const row = published[0];
    if (!row) return null;
    return { ...row, ...pickLocalizedResourceText(row, loc) };
  },
});

export const listByFacet = query({
  args: {
    facetType: facetTypeValidator,
    value: v.string(),
    limit: v.number(),
    locale: localeValidator,
  },
  handler: async (ctx, { facetType, value, limit, locale }) => {
    const lim = Math.min(Math.max(limit, 1), 60);
    const loc = resolveLocale(locale);
    const facetRows = await ctx.db
      .query('resourceFacets')
      .withIndex('by_facetType_and_value_and_status', (q) =>
        q.eq('facetType', facetType).eq('value', value).eq('status', 'published'),
      )
      .take(lim * 2);

    const docs = await Promise.all(facetRows.map((f) => ctx.db.get(f.resourceId)));

    const out: Array<{
      _id: unknown;
      title: string;
      slug: string;
      description: string;
      url: string;
      category?: ResourceCategoryKey;
      tags: string[];
      stageTags: string[];
      industries: string[];
      communities: string[];
    }> = [];

    for (let i = 0; i < facetRows.length; i++) {
      const r = docs[i];
      if (r && r.status === 'published') {
        const localized = pickLocalizedResourceText(r, loc);
        out.push({
          _id: r._id,
          title: localized.title,
          slug: r.slug,
          description: localized.description,
          url: r.url,
          category: r.category,
          tags: r.tags ?? [],
          stageTags: r.stageTags,
          industries: r.industries,
          communities: r.communities,
        });
        if (out.length >= lim) break;
      }
    }

    return out;
  },
});

export const facetValues = query({
  args: {
    facetType: facetTypeValidator,
    limit: v.number(),
  },
  handler: async (ctx, { facetType, limit }) => {
    const lim = Math.min(Math.max(limit, 1), 200);
    const rows = await ctx.db
      .query('resourceFacets')
      .withIndex('by_facetType_and_status', (q) => q.eq('facetType', facetType).eq('status', 'published'))
      .take(800);

    const uniq = new Map<string, number>();
    for (const r of rows) {
      uniq.set(r.value, (uniq.get(r.value) ?? 0) + 1);
    }
    return [...uniq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, lim)
      .map(([value]) => value);
  },
});

type GroupedItem = {
  _id: unknown;
  title: string;
  slug: string;
  description: string;
  url: string;
  category: ResourceCategoryKey;
  tags: string[];
  stageTags: string[];
  communities: string[];
  industries: string[];
  locations: string[];
};

type GroupedCategory = { items: GroupedItem[]; total: number };

export const listGroupedByCategory = query({
  args: { limitPerCategory: v.optional(v.number()), locale: localeValidator },
  handler: async (ctx, { limitPerCategory, locale }) => {
    // Default 50 keeps SSR payloads small. Hard cap at 500 gives headroom
    // before a category's full slice doesn't fit in one payload — a
    // paginated endpoint is the next step beyond that.
    const lim = Math.min(Math.max(limitPerCategory ?? 50, 1), 500);
    const loc = resolveLocale(locale);
    const results = Object.fromEntries(
      RESOURCE_CATEGORY_KEYS.map((k) => [k, { items: [], total: 0 } as GroupedCategory]),
    ) as Record<ResourceCategoryKey, GroupedCategory>;

    for (const key of RESOURCE_CATEGORY_KEYS) {
      // Total count is independent of the display cap so the UI can show the
      // true number even when only a slice is rendered. Capped at 1000 to
      // bound the scan as the catalog grows.
      const all = await ctx.db
        .query('resources')
        .withIndex('by_category', (q) => q.eq('category', key).eq('status', 'published'))
        .take(1000);
      const items = all.slice(0, lim).map((r) => {
        const localized = pickLocalizedResourceText(r, loc);
        return {
          _id: r._id,
          title: localized.title,
          slug: r.slug,
          description: localized.description,
          url: r.url,
          category: key,
          tags: r.tags ?? [],
          stageTags: r.stageTags,
          communities: r.communities,
          industries: r.industries,
          locations: r.locations,
        };
      });
      results[key] = { items, total: all.length };
    }
    return results;
  },
});

/**
 * Distinct values for every filter facet, returned in one query so the
 * filter bar doesn't fan out into 4 round-trips. Sorted by frequency so the
 * most-selected options surface first in each dropdown.
 */
export const listFilterFacets = query({
  args: {},
  handler: async (ctx) => {
    const FACET_TYPES = ['stage', 'industry', 'community', 'location'] as const;
    const out: Record<(typeof FACET_TYPES)[number], string[]> = {
      stage: [],
      industry: [],
      community: [],
      location: [],
    };
    for (const facetType of FACET_TYPES) {
      const rows = await ctx.db
        .query('resourceFacets')
        .withIndex('by_facetType_and_status', (q) =>
          q.eq('facetType', facetType).eq('status', 'published'),
        )
        .take(2000);
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.value, (counts.get(r.value) ?? 0) + 1);
      out[facetType] = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([v]) => v);
    }
    return out;
  },
});

export const recommendForProfile = query({
  args: {
    founderProfile: founderProfileValidator,
    limit: v.number(),
    locale: localeValidator,
  },
  handler: async (ctx, { founderProfile, limit, locale }) => {
    const clampedProfile = clampFounderProfileForConvex(founderProfile);
    const lim = Math.min(Math.max(limit, 1), 36);
    const loc = resolveLocale(locale);
    // Upper bound avoids unbounded collects as the catalog grows; raise or paginate later.
    const published = await ctx.db
      .query('resources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(3000);

    const scored = published
      .map((r) => {
        const localized = pickLocalizedResourceText(r, loc);
        return {
          doc: { ...r, title: localized.title, description: localized.description },
          score: scoreResourceForProfile(r, clampedProfile),
        };
      })
      .sort((a, b) => b.score - a.score);

    const positives = scored.filter((x) => x.score > 0);
    const poolForStart = positives.length > 0 ? positives : scored;
    const startHereRaw = poolForStart.slice(0, Math.min(6, lim));
    const ids = new Set(startHereRaw.map(({ doc }) => doc._id));

    const remaining = scored.filter(({ doc }) => !ids.has(doc._id));
    const nextRaw = remaining.slice(0, Math.min(12, Math.max(lim - startHereRaw.length, 0)));
    for (const x of nextRaw) ids.add(x.doc._id);
    const exploreRaw = scored
      .filter(({ doc }) => !ids.has(doc._id))
      .slice(0, Math.max(lim - startHereRaw.length - nextRaw.length, 0));

    return {
      startHere: projectReco(startHereRaw),
      next: projectReco(nextRaw),
      explore: projectReco(exploreRaw),
    };
  },
});

