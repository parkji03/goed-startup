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
      body: r.body,
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

/**
 * One-off corrective patch for the title of a single resource looked up by
 * its CSV sourceId. Used to repair rows where the original CSV had the
 * description content in the Title column. Recomputes searchText and
 * reschedules the embedding so search/recos pick up the fix.
 */
export const setTitleBySourceId = internalMutation({
  args: {
    sourceId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { sourceId, title }) => {
    const rows = await ctx.db
      .query('resources')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
      .take(2);
    if (rows.length === 0) throw new Error(`No resource with sourceId=${sourceId}`);
    if (rows.length > 1) throw new Error(`Multiple resources with sourceId=${sourceId}`);
    const r = rows[0]!;
    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('title is required');
    const searchText = buildSearchText({
      title: cleanTitle,
      description: r.description,
      url: r.url,
      contactEmail: r.contactEmail,
      category: r.category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags: r.tags,
      stageTags: r.stageTags,
      body: r.body,
    });
    await ctx.db.patch(r._id, {
      title: cleanTitle,
      searchText,
      lastSyncedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, {
      resourceId: r._id,
    });
    return { resourceId: r._id, previousTitle: r.title, newTitle: cleanTitle };
  },
});
