'use node';

import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { embeddingSourceText } from './lib/resourceHelpers';

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 1536;

export const embedResource = internalAction({
  args: { resourceId: v.id('resources') },
  handler: async (ctx, { resourceId }) => {
    const resource = await ctx.runQuery(internal.resourceEmbeddings.getResourceForEmbed, {
      resourceId,
    });
    if (!resource) return;
    const text = embeddingSourceText({
      title: resource.title,
      description: resource.description,
      topics: resource.topics,
      industries: resource.industries,
      communities: resource.communities,
      locations: resource.locations,
    });
    const { embedding } = await embed({
      model: openai.embedding(MODEL),
      value: text,
    });
    if (embedding.length !== DIMENSIONS) {
      throw new Error(`Unexpected embedding length ${embedding.length}`);
    }
    await ctx.runMutation(internal.resourceEmbeddings.upsertEmbedding, {
      resourceId,
      embedding: embedding as number[],
      embeddingModel: MODEL,
      status: resource.status,
    });
  },
});

export const vectorSearchPublished = internalAction({
  args: {
    vector: v.array(v.float64()),
    limit: v.number(),
  },
  handler: async (ctx, { vector, limit }) => {
    const results = await ctx.vectorSearch('resourceEmbeddings', 'by_embedding', {
      vector,
      limit,
      filter: (q) => q.eq('status', 'published'),
    });
    const out: { resourceId: Id<'resources'>; score: number }[] = [];
    for (const r of results) {
      const row = await ctx.runQuery(internal.resourceEmbeddings.getEmbeddingById, { id: r._id });
      if (row) {
        out.push({ resourceId: row.resourceId, score: r._score });
      }
    }
    return out;
  },
});

export const embedText = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, { text }) => {
    const { embedding } = await embed({
      model: openai.embedding(MODEL),
      value: text,
    });
    if (embedding.length !== DIMENSIONS) {
      throw new Error(`Unexpected embedding length ${embedding.length}`);
    }
    return embedding as number[];
  },
});
