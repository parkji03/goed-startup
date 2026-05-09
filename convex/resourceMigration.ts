import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTags,
} from './lib/resourceHelpers';
import { resourceCategoryValidator } from './resourceValidators';

/**
 * Per-resource override for low-confidence migrations or post-publish
 * recategorization. Recomputes searchText, replaces facets, reschedules
 * the embedding.
 */
export const setCategoryById = internalMutation({
  args: {
    resourceId: v.id('resources'),
    category: resourceCategoryValidator,
  },
  handler: async (ctx, { resourceId, category }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) throw new Error('Resource not found');
    const tags = r.tags;
    const stageTags = inferStageTagsFromTags(tags);
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
      stageTags,
    });
    await ctx.db.patch(resourceId, {
      category,
      searchText,
      lastSyncedAt: Date.now(),
    });
    const facetRows = facetsFromResourceFields({
      category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags,
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
