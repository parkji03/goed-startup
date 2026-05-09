import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import {
  facetTypeValidator,
  resourceCategoryValidator,
  resourceStatusValidator,
} from './resourceValidators';
import {
  COMMUNITY_VOCAB,
  INDUSTRY_VOCAB,
  LOCATION_VOCAB,
  clampToVocab,
} from './lib/facetVocabularies';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTags,
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
        facetType: facetTypeValidator,
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
  tagsRaw: v.optional(v.string()),
  category: resourceCategoryValidator,
  status: resourceStatusValidator,
  submissionId: v.optional(v.id('resourceSubmissions')),
});

export const upsertResource = internalMutation({
  args: {
    row: upsertRowValidator,
  },
  handler: async (ctx, { row }) => {
    const contactEmail = sanitizeContactEmail(row.contactEmail);
    const communities = clampToVocab(splitPipeList(row.communitiesRaw), COMMUNITY_VOCAB, 'communities');
    const industries = clampToVocab(splitPipeList(row.industriesRaw), INDUSTRY_VOCAB, 'industries');
    const locations = clampToVocab(splitPipeList(row.locationsRaw), LOCATION_VOCAB, 'locations');
    const tags = splitPipeList(row.tagsRaw);
    const stageTags = inferStageTagsFromTags(tags);
    const category = row.category;
    const slug = makeResourceSlug(row.title, row.sourceId);
    const existing = await ctx.db
      .query('resources')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', row.sourceId))
      .unique();
    // Preserve any existing body when re-importing — body is populated out of
    // band by patchBody (P2.3) and shouldn't be wiped by a CSV refresh.
    const body = existing?.body;
    const searchText = buildSearchText({
      title: row.title,
      description: row.description,
      url: row.url,
      contactEmail,
      category,
      communities,
      industries,
      locations,
      tags,
      stageTags,
      body,
    });

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
        tags,
        category,
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
        tags,
        category,
        stageTags,
        searchText,
        status: row.status,
        submissionId: row.submissionId,
        lastSyncedAt: Date.now(),
      });
    }

    const facetRows = facetsFromResourceFields({
      category,
      communities,
      industries,
      locations,
      tags,
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

/**
 * Hard-delete a resource by sourceId, cascading to its facet and embedding
 * rows. Used for content-derived rows we triage out post-import (e.g., events
 * that don't belong in the catalog). Internal-only — not callable from the
 * browser.
 */
export const deleteBySourceId = internalMutation({
  args: { sourceId: v.string() },
  handler: async (ctx, { sourceId }) => {
    const row = await ctx.db
      .query('resources')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
      .unique();
    if (!row) return { deleted: false, sourceId };

    const facets = await ctx.db
      .query('resourceFacets')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', row._id))
      .collect();
    for (const f of facets) await ctx.db.delete(f._id);

    const embeddings = await ctx.db
      .query('resourceEmbeddings')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', row._id))
      .collect();
    for (const e of embeddings) await ctx.db.delete(e._id);

    await ctx.db.delete(row._id);
    return { deleted: true, sourceId, slug: row.slug, title: row.title };
  },
});
