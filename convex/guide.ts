import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import {
  clampFounderProfileForConvex,
  emptyFounderProfile,
  founderProfileValidator,
  type FounderProfileConvex,
} from './founderProfile';

/**
 * Hackathon-mode guide:
 * - No persistence. Each `ask` call is independent — refreshing the chat
 *   wipes it. Matches the Cursor-docs UX target.
 * - No language model wired in yet. We answer with a deterministic stub
 *   that searches the resource catalog. Swap `buildStubReply` for a real
 *   `streamText` call (likely from an `httpAction`) once we're ready to
 *   spend tokens. The action's args + return shape are designed so the
 *   client doesn't have to change when streaming lands.
 * - No rate limiting yet. Add a `@convex-dev/rate-limiter` component (or
 *   IP-based throttling at the HTTP layer) before opening this up.
 */

const MAX_PROMPT_LENGTH = 6000;
const MAX_CONTEXT_HITS = 4;

const guideContextItemValidator = v.object({
  resourceId: v.id('resources'),
  title: v.string(),
  slug: v.string(),
  url: v.string(),
  description: v.string(),
  topics: v.array(v.string()),
  industries: v.array(v.string()),
  communities: v.array(v.string()),
});

export type GuideContextItem = {
  resourceId: Id<'resources'>;
  title: string;
  slug: string;
  url: string;
  description: string;
  topics: string[];
  industries: string[];
  communities: string[];
};

export const searchPublishedResourcesForGuide = internalQuery({
  args: { query: v.string(), limit: v.number() },
  returns: v.array(guideContextItemValidator),
  handler: async (ctx, { query, limit }): Promise<GuideContextItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const lim = Math.min(Math.max(limit, 1), MAX_CONTEXT_HITS);
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
      topics: r.topics,
      industries: r.industries,
      communities: r.communities,
    }));
  },
});

function profileSummary(profile: FounderProfileConvex): string | null {
  const bits = [
    profile.industries.length ? `industries: ${profile.industries.join(', ')}` : null,
    profile.stages.length ? `stages: ${profile.stages.join(', ')}` : null,
    profile.goals.length ? `goals: ${profile.goals.join(', ')}` : null,
    profile.audiences.length ? `audiences: ${profile.audiences.join(', ')}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

function buildStubReply(
  prompt: string,
  profile: FounderProfileConvex,
  hits: GuideContextItem[],
): string {
  if (hits.length === 0) {
    return [
      `Thanks for asking about "${prompt}".`,
      "I couldn't find a published Utah resource matching that yet. Try the founder quiz or browse the resource library — and the AI guide will get smarter once we wire it to a live model.",
    ].join('\n\n');
  }

  const lines = hits.map((h, i) => {
    const tags = [...h.topics, ...h.industries, ...h.communities].slice(0, 4).join(', ');
    return [
      `[#${i + 1}] ${h.title}`,
      `Link: /resources/${h.slug} · ${h.url}`,
      tags ? `Tags: ${tags}` : null,
      h.description.slice(0, 240),
    ]
      .filter(Boolean)
      .join('\n');
  });

  const summary = profileSummary(profile);
  return [
    `Here ${hits.length === 1 ? 'is a starting point' : `are ${hits.length} starting points`} that match "${prompt}":`,
    summary ? `_Personalized hint from your quiz — ${summary}._` : null,
    lines.join('\n\n'),
    '_(Hackathon stub: deterministic resource lookup. Live, streamed model responses land next.)_',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export const ask = action({
  args: {
    prompt: v.string(),
    founderProfile: v.optional(founderProfileValidator),
  },
  returns: v.object({
    reply: v.string(),
    context: v.array(guideContextItemValidator),
  }),
  handler: async (ctx, { prompt, founderProfile }) => {
    const trimmed = prompt.trim().slice(0, MAX_PROMPT_LENGTH);
    if (!trimmed) {
      return { reply: '', context: [] };
    }

    const profile = clampFounderProfileForConvex(founderProfile ?? emptyFounderProfile());
    const context: GuideContextItem[] = await ctx.runQuery(
      internal.guide.searchPublishedResourcesForGuide,
      { query: trimmed, limit: MAX_CONTEXT_HITS },
    );

    const reply = buildStubReply(trimmed, profile, context);
    return { reply, context };
  },
});
