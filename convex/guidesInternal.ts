import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import { guideCategoryValidator } from './guideValidators';
import { resourceStatusValidator } from './resourceValidators';
import {
  buildGuideSearchText,
  facetsFromGuideFields,
  makeGuideSlug,
} from './lib/guideHelpers';

const upsertRowValidator = v.object({
  sourceId: v.string(),
  title: v.string(),
  description: v.string(),
  body: v.string(),
  sourceUrl: v.string(),
  category: guideCategoryValidator,
  tags: v.array(v.string()),
  stageTags: v.array(v.string()),
  journeyStep: v.optional(v.number()),
  status: resourceStatusValidator,
});

export const replaceGuideFacets = internalMutation({
  args: {
    guideId: v.id('guides'),
    status: resourceStatusValidator,
    facetRows: v.array(
      v.object({
        facetType: v.union(v.literal('category'), v.literal('tag'), v.literal('stage')),
        value: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('guideFacets')
      .withIndex('by_guideId', (q) => q.eq('guideId', args.guideId))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const row of args.facetRows) {
      await ctx.db.insert('guideFacets', {
        guideId: args.guideId,
        facetType: row.facetType,
        value: row.value,
        status: args.status,
      });
    }
  },
});

/**
 * Upsert a guide by sourceId. Mirrors upsertResource but without the
 * community/industry/location facets and without the embedding hook.
 */
export const upsertGuide = internalMutation({
  args: { row: upsertRowValidator },
  handler: async (ctx, { row }) => {
    const slug = makeGuideSlug(row.title, row.sourceId);
    const searchText = buildGuideSearchText({
      title: row.title,
      description: row.description,
      body: row.body,
      category: row.category,
      tags: row.tags,
      stageTags: row.stageTags,
      journeyStep: row.journeyStep,
    });
    const existing = await ctx.db
      .query('guides')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', row.sourceId))
      .unique();

    let guideId: Id<'guides'>;
    if (existing) {
      guideId = existing._id;
      await ctx.db.patch(guideId, {
        title: row.title,
        slug,
        description: row.description,
        body: row.body,
        sourceUrl: row.sourceUrl,
        category: row.category,
        tags: row.tags,
        stageTags: row.stageTags,
        journeyStep: row.journeyStep,
        searchText,
        status: row.status,
        lastSyncedAt: Date.now(),
      });
    } else {
      guideId = await ctx.db.insert('guides', {
        title: row.title,
        slug,
        description: row.description,
        body: row.body,
        sourceUrl: row.sourceUrl,
        category: row.category,
        tags: row.tags,
        stageTags: row.stageTags,
        journeyStep: row.journeyStep,
        searchText,
        status: row.status,
        sourceId: row.sourceId,
        lastSyncedAt: Date.now(),
      });
    }

    const facetRows = facetsFromGuideFields({
      category: row.category,
      tags: row.tags,
      stageTags: row.stageTags,
    });
    await ctx.runMutation(internal.guidesInternal.replaceGuideFacets, {
      guideId,
      status: row.status,
      facetRows,
    });

    return { guideId, slug };
  },
});

/**
 * Bulk import — mirrors resourceImport:importInternal. Idempotent by sourceId.
 * Internal-only; not callable from the browser.
 */
export const importInternal = internalMutation({
  args: {
    rows: v.array(upsertRowValidator),
  },
  handler: async (ctx, { rows }) => {
    for (const row of rows) {
      await ctx.runMutation(internal.guidesInternal.upsertGuide, { row });
    }
    return { applied: rows.length };
  },
});

export const deleteBySourceId = internalMutation({
  args: { sourceId: v.string() },
  handler: async (ctx, { sourceId }) => {
    const row = await ctx.db
      .query('guides')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
      .unique();
    if (!row) return { deleted: false, sourceId };
    const facets = await ctx.db
      .query('guideFacets')
      .withIndex('by_guideId', (q) => q.eq('guideId', row._id))
      .collect();
    for (const f of facets) await ctx.db.delete(f._id);
    await ctx.db.delete(row._id);
    return { deleted: true, sourceId, slug: row.slug, title: row.title };
  },
});
