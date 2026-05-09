import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { assignCategory, cleanTags } from '../lib/resources/migration-rules';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTopics,
} from './lib/resourceHelpers';
import { resourceCategoryValidator } from './resourceValidators';

export const backfillCategoriesAndTags = internalMutation({
  args: {
    /** When true, skip resources that already have a category. Default: true. */
    skipAlreadyCategorized: v.optional(v.boolean()),
  },
  handler: async (ctx, { skipAlreadyCategorized = true }) => {
    const resources = await ctx.db.query('resources').take(5000);
    let updated = 0;
    let lowConfidence = 0;
    for (const r of resources) {
      if (skipAlreadyCategorized && r.category) continue;

      const { category, confidence } = assignCategory({
        title: r.title,
        topics: r.topics,
      });
      const tags = cleanTags(r.topics);
      const stageTags = inferStageTagsFromTopics(r.topics);

      const searchText = buildSearchText({
        title: r.title,
        description: r.description,
        url: r.url,
        contactEmail: r.contactEmail,
        category,
        communities: r.communities,
        industries: r.industries,
        locations: r.locations,
        tags,
        topics: r.topics,
        stageTags,
      });

      await ctx.db.patch(r._id, {
        category,
        tags,
        stageTags,
        searchText,
        lastSyncedAt: Date.now(),
      });

      const facetRows = facetsFromResourceFields({
        category,
        communities: r.communities,
        industries: r.industries,
        locations: r.locations,
        tags,
        topics: r.topics,
        stageTags,
      });
      await ctx.runMutation(internal.resourceInternal.replaceFacets, {
        resourceId: r._id,
        status: r.status,
        facetRows,
      });

      // Re-run embedding so the new category text lands in the vector.
      await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, {
        resourceId: r._id,
      });

      updated += 1;
      if (confidence === 'low') lowConfidence += 1;
    }
    return { updated, lowConfidence, scanned: resources.length };
  },
});

export const setCategoryById = internalMutation({
  args: {
    resourceId: v.id('resources'),
    category: resourceCategoryValidator,
  },
  handler: async (ctx, { resourceId, category }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) throw new Error('Resource not found');
    const tags = r.tags ?? cleanTags(r.topics);
    const searchText = buildSearchText({
      title: r.title,
      description: r.description,
      url: r.url,
      contactEmail: r.contactEmail,
      category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags,
      topics: r.topics,
      stageTags: r.stageTags,
    });
    await ctx.db.patch(resourceId, { category, tags, searchText, lastSyncedAt: Date.now() });
    const facetRows = facetsFromResourceFields({
      category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags,
      topics: r.topics,
      stageTags: r.stageTags,
    });
    await ctx.runMutation(internal.resourceInternal.replaceFacets, {
      resourceId,
      status: r.status,
      facetRows,
    });
    await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, { resourceId });
  },
});
