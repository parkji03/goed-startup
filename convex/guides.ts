import { paginationOptsValidator } from 'convex/server';
import { type Infer, v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import { internalQuery, query } from './_generated/server';
import { GUIDE_CATEGORY_KEYS } from '../lib/guides/categories';
import { guideCategoryValidator } from './guideValidators';

/**
 * Public + internal queries against the guides table. Mirrors
 * convex/resources.ts but with the lighter shape — no community/industry/
 * location facets, plus a journey-step ordering query.
 */

/**
 * Lightweight projection for sitemap generation. Returns just slug +
 * last sync time so SSG/sitemap builds avoid pulling the full document.
 */
export const sitemapEntries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('guides')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(5000);
    return rows.map((g) => ({
      slug: g.slug,
      lastModified: g.lastSyncedAt ?? g._creationTime,
    }));
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const rows = await ctx.db
      .query('guides')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .take(8);
    const published = rows.filter((r) => r.status === 'published');
    return published[0] ?? null;
  },
});

export const listPublishedPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query('guides')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('asc')
      .paginate(paginationOpts);
    return {
      ...page,
      page: page.page.map((g) => ({
        _id: g._id,
        title: g.title,
        slug: g.slug,
        description: g.description,
        category: g.category,
        tags: g.tags,
        stageTags: g.stageTags,
        journeyStep: g.journeyStep,
      })),
    };
  },
});

type GroupedItem = {
  _id: Id<'guides'>;
  title: string;
  slug: string;
  description: string;
  category: Infer<typeof guideCategoryValidator>;
  tags: string[];
  stageTags: string[];
  journeyStep?: number;
};

type GroupedCategory = { items: GroupedItem[]; total: number };

export const listGroupedByCategory = query({
  args: { limitPerCategory: v.optional(v.number()) },
  handler: async (ctx, { limitPerCategory }) => {
    // Default 50 keeps SSR payloads small. Hard cap at 500 gives headroom
    // before a category's full slice doesn't fit in one payload.
    const lim = Math.min(Math.max(limitPerCategory ?? 50, 1), 500);
    const results = Object.fromEntries(
      GUIDE_CATEGORY_KEYS.map((k) => [k, { items: [], total: 0 } as GroupedCategory]),
    ) as Record<Infer<typeof guideCategoryValidator>, GroupedCategory>;
    for (const key of GUIDE_CATEGORY_KEYS) {
      const all = await ctx.db
        .query('guides')
        .withIndex('by_category', (q) => q.eq('category', key).eq('status', 'published'))
        .take(1000);
      const items = all.slice(0, lim).map((g) => ({
        _id: g._id,
        title: g.title,
        slug: g.slug,
        description: g.description,
        category: key,
        tags: g.tags,
        stageTags: g.stageTags,
        journeyStep: g.journeyStep,
      }));
      results[key] = { items, total: all.length };
    }
    return results;
  },
});

/**
 * The 19-step founder journey, ordered by journeyStep ascending. Used by the
 * /guides/journey overview page.
 */
export const listJourneySteps = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db
      .query('guides')
      .withIndex('by_category', (q) => q.eq('category', 'journey-step').eq('status', 'published'))
      .take(50);
    return all
      .filter((g) => typeof g.journeyStep === 'number')
      .sort((a, b) => (a.journeyStep ?? 0) - (b.journeyStep ?? 0))
      .map((g) => ({
        _id: g._id,
        title: g.title,
        slug: g.slug,
        description: g.description,
        journeyStep: g.journeyStep ?? 0,
        stageTags: g.stageTags,
      }));
  },
});

// ---------------------------------------------------------------------------
// Internal — agent retrieval. Mirrors searchPublishedResourcesForGuide so the
// `retrieve` action in convex/guide.ts can fan out across both collections.
// ---------------------------------------------------------------------------

const RAW_LIMIT = 12;
const BODY_EXCERPT_CHARS = 1500;

export const guideRagItemValidator = v.object({
  guideId: v.id('guides'),
  title: v.string(),
  slug: v.string(),
  sourceUrl: v.string(),
  description: v.string(),
  category: guideCategoryValidator,
  tags: v.array(v.string()),
  stageTags: v.array(v.string()),
  journeyStep: v.optional(v.number()),
  bodyExcerpt: v.optional(v.string()),
});

export type GuideRagItem = {
  guideId: Id<'guides'>;
  title: string;
  slug: string;
  sourceUrl: string;
  description: string;
  category: Infer<typeof guideCategoryValidator>;
  tags: string[];
  stageTags: string[];
  journeyStep?: number;
  bodyExcerpt?: string;
};

function bodyExcerpt(body: string, max: number = BODY_EXCERPT_CHARS): string {
  if (body.length <= max) return body.trim();
  const window = body.slice(0, max);
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = window[i + 1];
      if (next === undefined || /\s/.test(next)) {
        return window.slice(0, i + 1).trim();
      }
    }
  }
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

export const searchPublishedGuidesForGuide = internalQuery({
  args: { query: v.string(), limit: v.number() },
  returns: v.array(guideRagItemValidator),
  handler: async (ctx, { query, limit }): Promise<GuideRagItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lim = Math.min(Math.max(limit, 1), RAW_LIMIT);
    const hits = await ctx.db
      .query('guides')
      .withSearchIndex('search_guides', (s) =>
        s.search('searchText', trimmed).eq('status', 'published'),
      )
      .take(lim);
    return hits.map((g) => ({
      guideId: g._id,
      title: g.title,
      slug: g.slug,
      sourceUrl: g.sourceUrl,
      description: g.description,
      category: g.category,
      tags: g.tags,
      stageTags: g.stageTags,
      journeyStep: g.journeyStep,
      bodyExcerpt: bodyExcerpt(g.body),
    }));
  },
});
