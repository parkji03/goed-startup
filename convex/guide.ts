import { type Infer, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import {
  clampFounderProfileForConvex,
  emptyFounderProfile,
  founderProfileValidator,
} from './founderProfile';
import {
  expandQuery,
  rankWithProfile,
  synthesizeQueryFromProfile,
  validateRetrievalInput,
} from './lib/guideQuery';
import { resourceCategoryValidator } from './resourceValidators';

/**
 * AI guide retrieval — full-text only (no embeddings in v1). Public action so
 * the Next.js /api/chat route can call it via ConvexHttpClient. The Next route
 * owns the LLM call and the abuse layer; this action is intentionally narrow:
 * input → ranked context, no model interaction here.
 */

const RAW_LIMIT = 12;
const FALLBACK_THRESHOLD = 4;
const TOP_K = 6;

const guideContextItemValidator = v.object({
  resourceId: v.id('resources'),
  title: v.string(),
  slug: v.string(),
  url: v.string(),
  description: v.string(),
  category: resourceCategoryValidator,
  tags: v.array(v.string()),
  industries: v.array(v.string()),
  communities: v.array(v.string()),
  locations: v.array(v.string()),
  stageTags: v.array(v.string()),
});

export type GuideContextItem = {
  resourceId: Id<'resources'>;
  title: string;
  slug: string;
  url: string;
  description: string;
  category: Infer<typeof resourceCategoryValidator>;
  tags: string[];
  industries: string[];
  communities: string[];
  locations: string[];
  stageTags: string[];
};

export const searchPublishedResourcesForGuide = internalQuery({
  args: { query: v.string(), limit: v.number() },
  returns: v.array(guideContextItemValidator),
  handler: async (ctx, { query, limit }): Promise<GuideContextItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lim = Math.min(Math.max(limit, 1), RAW_LIMIT);
    const hits = await ctx.db
      .query('resources')
      .withSearchIndex('search_resources', (s) =>
        s.search('searchText', trimmed).eq('status', 'published'),
      )
      .take(lim);
    return hits.map((r) => ({
      resourceId: r._id,
      title: r.title,
      slug: r.slug,
      url: r.url,
      description: r.description,
      category: r.category,
      tags: r.tags,
      industries: r.industries,
      communities: r.communities,
      locations: r.locations,
      stageTags: r.stageTags,
    }));
  },
});

export const retrieve = action({
  args: {
    query: v.string(),
    founderProfile: v.optional(founderProfileValidator),
  },
  returns: v.object({
    context: v.array(guideContextItemValidator),
  }),
  handler: async (ctx, { query, founderProfile }) => {
    const validation = validateRetrievalInput(query);
    if (!validation.ok) return { context: [] };

    const profile = clampFounderProfileForConvex(founderProfile ?? emptyFounderProfile());

    const expanded = expandQuery(validation.query, profile);
    const lexical: GuideContextItem[] = expanded
      ? await ctx.runQuery(internal.guide.searchPublishedResourcesForGuide, {
          query: expanded,
          limit: RAW_LIMIT,
        })
      : [];

    let merged: GuideContextItem[] = lexical;

    if (lexical.length < FALLBACK_THRESHOLD) {
      const synth = synthesizeQueryFromProfile(profile);
      if (synth) {
        const fallback: GuideContextItem[] = await ctx.runQuery(
          internal.guide.searchPublishedResourcesForGuide,
          { query: synth, limit: RAW_LIMIT },
        );
        const seen = new Set(lexical.map((h) => h.slug));
        for (const f of fallback) if (!seen.has(f.slug)) merged.push(f);
      }
    }

    const ranked = rankWithProfile(merged, profile);
    return { context: ranked.slice(0, TOP_K) };
  },
});
