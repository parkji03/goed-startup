import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const getResourceForEmbed = internalQuery({
  args: { resourceId: v.id('resources') },
  handler: async (ctx, { resourceId }) => {
    return await ctx.db.get(resourceId);
  },
});

export const getEmbeddingById = internalQuery({
  args: { id: v.id('resourceEmbeddings') },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const upsertEmbedding = internalMutation({
  args: {
    resourceId: v.id('resources'),
    embedding: v.array(v.float64()),
    embeddingModel: v.string(),
    status: v.union(v.literal('draft'), v.literal('published'), v.literal('archived')),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('resourceEmbeddings')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', args.resourceId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        embedding: args.embedding,
        embeddingModel: args.embeddingModel,
        status: args.status,
      });
    } else {
      await ctx.db.insert('resourceEmbeddings', {
        resourceId: args.resourceId,
        embedding: args.embedding,
        embeddingModel: args.embeddingModel,
        status: args.status,
      });
    }
  },
});

