import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';
import { getThreadMetadata, listUIMessages, syncStreams } from '@convex-dev/agent';
import { vStreamArgs } from '@convex-dev/agent/validators';
import { components } from './_generated/api';
import { query } from './_generated/server';
import { founderProfileValidator } from './founderProfile';
import { scoreResourceForProfile } from './lib/matchResources';

function projectReco(
  rows: Array<{
    doc: {
      _id: unknown;
      title: string;
      slug: string;
      description: string;
      url: string;
      topics: string[];
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
    topics: doc.topics,
    industries: doc.industries,
    communities: doc.communities,
    matchScore: score,
    reason:
      score > 0
        ? 'Matches your quiz answers (topics, industry, location, or founder community).'
        : 'Popular starting point — add more quiz detail to personalize further.',
  }));
}

export const search = query({
  args: {
    query: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, { query: q, limit }) => {
    const lim = Math.min(Math.max(limit, 1), 25);
    if (!q.trim()) {
      return [];
    }
    return await ctx.db
      .query('resources')
      .withSearchIndex('search_resources', (s) => s.search('searchText', q).eq('status', 'published'))
      .take(lim);
  },
});

export const listPublishedPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const page = await ctx.db
      .query('resources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('asc')
      .paginate(paginationOpts);

    return {
      ...page,
      page: page.page.map((r) => ({
        _id: r._id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        url: r.url,
        topics: r.topics,
        industries: r.industries,
        communities: r.communities,
      })),
    };
  },
});

export const bySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query('resources')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!row || row.status !== 'published') return null;
    return row;
  },
});

export const listByFacet = query({
  args: {
    facetType: v.union(
      v.literal('community'),
      v.literal('industry'),
      v.literal('location'),
      v.literal('topic'),
      v.literal('stage'),
    ),
    value: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, { facetType, value, limit }) => {
    const lim = Math.min(Math.max(limit, 1), 60);
    const facetRows = await ctx.db
      .query('resourceFacets')
      .withIndex('by_facetType_and_value_and_status', (q) =>
        q.eq('facetType', facetType).eq('value', value).eq('status', 'published'),
      )
      .take(lim * 2);

    const out: Array<{
      _id: unknown;
      title: string;
      slug: string;
      description: string;
      url: string;
      topics: string[];
      industries: string[];
      communities: string[];
    }> = [];

    for (const f of facetRows) {
      const r = await ctx.db.get(f.resourceId);
      if (r && r.status === 'published') {
        out.push({
          _id: r._id,
          title: r.title,
          slug: r.slug,
          description: r.description,
          url: r.url,
          topics: r.topics,
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
    facetType: v.union(
      v.literal('community'),
      v.literal('industry'),
      v.literal('location'),
      v.literal('topic'),
      v.literal('stage'),
    ),
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

export const recommendForProfile = query({
  args: {
    founderProfile: founderProfileValidator,
    limit: v.number(),
  },
  handler: async (ctx, { founderProfile, limit }) => {
    const lim = Math.min(Math.max(limit, 1), 36);
    const published = await ctx.db
      .query('resources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(400);

    const scored = published
      .map((r) => ({
        doc: r,
        score: scoreResourceForProfile(r, founderProfile),
      }))
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

// —— Guide thread UI (Convex Agent) ——

export const listThreadUIMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const meta = await getThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
    });
    const identity = await ctx.auth.getUserIdentity();
    if (meta.userId && meta.userId !== identity?.tokenIdentifier) {
      throw new Error('Unauthorized');
    }

    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });

    return { ...paginated, streams };
  },
});
