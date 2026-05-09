import { type Infer, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import {
  clampFounderProfileForConvex,
  emptyFounderProfile,
  founderProfileValidator,
} from './founderProfile';
import { guideRagItemValidator, type GuideRagItem } from './guides';
import {
  expandQuery,
  filterByProfileSignal,
  rankWithProfile,
  synthesizeQueryFromProfile,
  validateRetrievalInput,
} from './lib/guideQuery';
import { pickLocalizedResourceText, type ResourceLocale } from './lib/resourceHelpers';
import { resourceCategoryValidator } from './resourceValidators';

const localeValidator = v.optional(v.union(v.literal('en'), v.literal('es')));

function resolveLocale(locale: ResourceLocale | undefined): ResourceLocale {
  return locale ?? 'en';
}

/**
 * AI guide retrieval — full-text only (no embeddings in v1). Public action so
 * the Next.js /api/chat route can call it via ConvexHttpClient. The Next route
 * owns the LLM call and the abuse layer; this action is intentionally narrow:
 * input → ranked context, no model interaction here.
 */

const RAW_LIMIT = 12;
const FALLBACK_THRESHOLD = 4;
const TOP_K = 6;
const TOP_K_GUIDES = 4;

/**
 * Char cap for the body excerpt threaded into the model's context. With
 * TOP_K=6 hits this adds up to ~9000 chars (~2.2k tokens) per turn, in
 * exchange for letting the model cite specific eligibility, dollar amounts,
 * and program details that aren't in the 600-char description.
 */
const BODY_EXCERPT_CHARS = 800;

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
  /** Trimmed prose excerpt of the long-form body (P2.3). Optional. */
  bodyExcerpt: v.optional(v.string()),
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
  bodyExcerpt?: string;
};

/**
 * Trim a markdown body to ~max chars at the last sentence boundary. Leaves
 * markdown formatting intact — the model handles it fine and stripping
 * markdown loses meaningful structure (lists, links).
 */
function bodyExcerpt(body: string | undefined, max: number = BODY_EXCERPT_CHARS): string | undefined {
  if (!body) return undefined;
  if (body.length <= max) return body.trim();
  const window = body.slice(0, max);
  // Walk back to the last sentence-ending punctuation followed by whitespace.
  for (let i = window.length - 1; i >= 0; i--) {
    const ch = window[i];
    if (ch === '.' || ch === '!' || ch === '?') {
      const next = window[i + 1];
      if (next === undefined || /\s/.test(next)) {
        return window.slice(0, i + 1).trim();
      }
    }
  }
  // Fall back to the last whitespace boundary.
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

export const searchPublishedResourcesForGuide = internalQuery({
  args: { query: v.string(), limit: v.number(), locale: localeValidator },
  returns: v.array(guideContextItemValidator),
  handler: async (ctx, { query, limit, locale }): Promise<GuideContextItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lim = Math.min(Math.max(limit, 1), RAW_LIMIT);
    const loc = resolveLocale(locale);
    const hits = await ctx.db
      .query('resources')
      .withSearchIndex('search_resources', (s) =>
        s.search('searchText', trimmed).eq('status', 'published'),
      )
      .take(lim);
    return hits.map((r) => {
      const localized = pickLocalizedResourceText(r, loc);
      return {
        resourceId: r._id,
        title: localized.title,
        slug: r.slug,
        url: r.url,
        description: localized.description,
        category: r.category,
        tags: r.tags,
        industries: r.industries,
        communities: r.communities,
        locations: r.locations,
        stageTags: r.stageTags,
        // Body has no per-locale variant yet — Spanish chats see the
        // English excerpt; the system prompt asks the model to translate
        // it inline when responding in Spanish.
        bodyExcerpt: bodyExcerpt(r.body),
      };
    });
  },
});

export const retrieve = action({
  args: {
    query: v.string(),
    founderProfile: v.optional(founderProfileValidator),
    locale: localeValidator,
  },
  returns: v.object({
    context: v.array(guideContextItemValidator),
    guides: v.array(guideRagItemValidator),
  }),
  handler: async (ctx, { query, founderProfile, locale }) => {
    const validation = validateRetrievalInput(query);
    if (!validation.ok) return { context: [], guides: [] };

    const profile = clampFounderProfileForConvex(founderProfile ?? emptyFounderProfile());
    const loc = resolveLocale(locale);

    const expanded = expandQuery(validation.query, profile);

    // Resources branch — existing logic with profile-aware ranking.
    const lexical: GuideContextItem[] = expanded
      ? await ctx.runQuery(internal.guide.searchPublishedResourcesForGuide, {
          query: expanded,
          limit: RAW_LIMIT,
          locale: loc,
        })
      : [];

    const merged: GuideContextItem[] = lexical;

    if (lexical.length < FALLBACK_THRESHOLD) {
      const synth = synthesizeQueryFromProfile(profile);
      if (synth) {
        const fallback: GuideContextItem[] = await ctx.runQuery(
          internal.guide.searchPublishedResourcesForGuide,
          { query: synth, limit: RAW_LIMIT, locale: loc },
        );
        const seen = new Set(lexical.map((h) => h.slug));
        for (const f of fallback) if (!seen.has(f.slug)) merged.push(f);
      }
    }

    const ranked = rankWithProfile(merged, profile);
    const filtered = filterByProfileSignal(ranked, profile);

    // Guides branch — pure lexical, no profile ranking. Guides don't carry
    // community/industry/location facets to score against, and the ranking
    // helpers were designed for resources. Top-K straight from the search
    // index keeps things simple.
    const guides: GuideRagItem[] = expanded
      ? await ctx.runQuery(internal.guides.searchPublishedGuidesForGuide, {
          query: expanded,
          limit: TOP_K_GUIDES,
        })
      : [];

    return {
      context: filtered.slice(0, TOP_K),
      guides,
    };
  },
});
