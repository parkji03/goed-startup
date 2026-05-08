import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { resourceStatusValidator } from './resourceValidators';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTopics,
  makeResourceSlug,
  sanitizeContactEmail,
  splitPipeList,
} from './lib/resourceHelpers';

export const replaceFacets = internalMutation({
  args: {
    resourceId: v.id('resources'),
    status: resourceStatusValidator,
    facetRows: v.array(
      v.object({
        facetType: v.union(
          v.literal('community'),
          v.literal('industry'),
          v.literal('location'),
          v.literal('topic'),
          v.literal('stage'),
        ),
        value: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('resourceFacets')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', args.resourceId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    for (const row of args.facetRows) {
      await ctx.db.insert('resourceFacets', {
        resourceId: args.resourceId,
        facetType: row.facetType,
        value: row.value,
        status: args.status,
      });
    }
  },
});

const upsertRowValidator = v.object({
  sourceId: v.string(),
  title: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  communitiesRaw: v.optional(v.string()),
  industriesRaw: v.optional(v.string()),
  locationsRaw: v.optional(v.string()),
  topicsRaw: v.optional(v.string()),
  status: resourceStatusValidator,
  submissionId: v.optional(v.id('resourceSubmissions')),
});

export const upsertResource = internalMutation({
  args: {
    row: upsertRowValidator,
  },
  handler: async (ctx, { row }) => {
    const contactEmail = sanitizeContactEmail(row.contactEmail);
    const communities = splitPipeList(row.communitiesRaw);
    const industries = splitPipeList(row.industriesRaw);
    const locations = splitPipeList(row.locationsRaw);
    const topics = splitPipeList(row.topicsRaw);
    const stageTags = inferStageTagsFromTopics(topics);
    const searchText = buildSearchText({
      title: row.title,
      description: row.description,
      url: row.url,
      contactEmail,
      communities,
      industries,
      locations,
      topics,
      stageTags,
    });
    const slug = makeResourceSlug(row.title, row.sourceId);
    const existing = await ctx.db
      .query('resources')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', row.sourceId))
      .unique();

    let resourceId: Id<'resources'>;
    if (existing) {
      resourceId = existing._id;
      await ctx.db.patch(resourceId, {
        title: row.title,
        slug,
        description: row.description,
        url: row.url,
        contactEmail,
        sourceId: row.sourceId,
        communities,
        industries,
        locations,
        topics,
        stageTags,
        searchText,
        status: row.status,
        submissionId: row.submissionId,
        lastSyncedAt: Date.now(),
      });
    } else {
      resourceId = await ctx.db.insert('resources', {
        title: row.title,
        slug,
        description: row.description,
        url: row.url,
        contactEmail,
        sourceId: row.sourceId,
        communities,
        industries,
        locations,
        topics,
        stageTags,
        searchText,
        status: row.status,
        submissionId: row.submissionId,
        lastSyncedAt: Date.now(),
      });
    }

    const facetRows = facetsFromResourceFields({
      communities,
      industries,
      locations,
      topics,
      stageTags,
    });
    await ctx.runMutation(internal.resourceInternal.replaceFacets, {
      resourceId,
      status: row.status,
      facetRows,
    });

    await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, {
      resourceId,
    });
  },
});

export const loadResourcesByIds = internalQuery({
  args: { ids: v.array(v.id('resources')) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return docs.filter((doc): doc is NonNullable<(typeof docs)[number]> => doc?.status === 'published');
  },
});

export const getPublishedBySlug = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query('resources')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();
    return row?.status === 'published' ? row : null;
  },
});
