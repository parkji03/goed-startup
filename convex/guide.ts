import { openai } from '@ai-sdk/openai';
import { Agent, getThreadMetadata } from '@convex-dev/agent';
import { v } from 'convex/values';
import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalQuery, mutation } from './_generated/server';
import {
  clampFounderProfileForConvex,
  founderProfileValidator,
  emptyFounderProfile,
  type FounderProfileConvex,
} from './founderProfile';
import { scoreResourceForProfile } from './lib/matchResources';

const guideAgent = new Agent(components.agent, {
  name: 'Utah Founder Guide',
  languageModel: openai.chat('gpt-4o-mini'),
  embeddingModel: openai.embedding('text-embedding-3-small'),
});

/** Actions must delegate thread ownership checks here (runs with the user's auth context). */
export const assertGuideThreadOwnership = internalQuery({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const tokenId = identity?.tokenIdentifier;
    if (!tokenId) {
      throw new Error('Sign in required to use the founder guide.');
    }
    const meta = await getThreadMetadata(ctx, components.agent, { threadId });
    if (!meta.userId) {
      throw new Error('This thread cannot be resumed. Reset and start a new guide chat.');
    }
    if (meta.userId !== tokenId) {
      throw new Error('Unauthorized — this guide thread belongs to another account.');
    }
  },
});

export const createThread = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.tokenIdentifier;
    if (!userId) {
      throw new Error('Sign in required to use the founder guide.');
    }
    const { threadId } = await guideAgent.createThread(ctx, { userId });
    return { threadId };
  },
});

export const sendMessage = action({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    founderProfile: v.optional(founderProfileValidator),
  },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.guide.assertGuideThreadOwnership, {
      threadId: args.threadId,
    });

    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.tokenIdentifier) {
      throw new Error('Sign in required to send guide messages.');
    }
    const userId = identity.tokenIdentifier;

    const prompt = args.prompt.trim().slice(0, 6000);

    const profile: FounderProfileConvex = clampFounderProfileForConvex(
      args.founderProfile ?? emptyFounderProfile(),
    );

    const embedInput = [
      prompt,
      profile.freeText ?? '',
      ...profile.goals,
      ...profile.industries,
      ...profile.stages,
      ...profile.audiences,
    ].join('\n');

    const vector = await ctx.runAction(internal.resourceEmbeddingsNode.embedText, {
      text: embedInput.slice(0, 8000),
    });

    const hits = (await ctx.runAction(internal.resourceEmbeddingsNode.vectorSearchPublished, {
      vector,
      limit: 40,
    })) as Array<{ resourceId: Id<'resources'>; score: number }>;

    const resources = (await ctx.runQuery(internal.resourceInternal.loadResourcesByIds, {
      ids: hits.map((h) => h.resourceId),
    })) as Doc<'resources'>[];

    const ranked = resources
      .map((r) => ({
        r,
        vec: hits.find((h) => h.resourceId === r._id)?.score ?? 0,
        overlap: scoreResourceForProfile(r, profile),
      }))
      .sort((a, b) => b.overlap * 3 + b.vec - (a.overlap * 3 + a.vec))
      .slice(0, 8);

    const retrievalContext = ranked
      .map(
        ({ r }, i) =>
          `[#${i + 1}] ${r.title}\nslug: ${r.slug}\n${r.description.slice(0, 600)}\nLink: ${r.url}\nTopics: ${r.topics.join(', ')}`,
      )
      .join('\n\n---\n');

    const { thread } = await guideAgent.continueThread(ctx, {
      threadId: args.threadId,
      userId,
    });

    const result = await thread.streamText(
      {
        system:
          'You are an expert Utah founder navigator. Recommend concrete next steps.\n' +
          'Use ONLY the numbered resources below when suggesting programs and always cite them like [#1], [#2].\n' +
          'If none apply, say what is missing briefly and ask one clarifying question.\n\n' +
          'RESOURCES CONTEXT:\n' +
          retrievalContext,
        prompt,
      },
      { saveStreamDeltas: true },
    );

    await result.consumeStream();

    return { ok: true };
  },
});
