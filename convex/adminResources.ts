import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { checkAdminGate, requireAdmin } from './lib/adminAuth';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTags,
  makeResourceSlug,
  sanitizeContactEmail,
} from './lib/resourceHelpers';
import {
  adminAccessDeniedReasonValidator,
  resourceCategoryValidator,
  resourceStatusValidator,
} from './resourceValidators';

const adminResourceRowValidator = v.object({
  _id: v.id('resources'),
  title: v.string(),
  slug: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.union(v.string(), v.null()),
  category: resourceCategoryValidator,
  tags: v.array(v.string()),
  stageTags: v.array(v.string()),
  communities: v.array(v.string()),
  industries: v.array(v.string()),
  locations: v.array(v.string()),
  status: resourceStatusValidator,
  sourceId: v.union(v.string(), v.null()),
});

/**
 * Every resource — any status — for the admin Resources page. Mirrors the
 * shape used by `admin-resources-client.tsx` so the UI doesn't have to map
 * defaults. Returns the access-gate failure reason instead of throwing so
 * the page can render a denied panel like the other admin surfaces.
 */
export const listAllForAdmin = query({
  args: {},
  returns: v.union(
    v.object({
      access: v.literal('allowed'),
      resources: v.array(adminResourceRowValidator),
    }),
    v.object({
      access: v.literal('denied'),
      reason: adminAccessDeniedReasonValidator,
    }),
  ),
  handler: async (ctx) => {
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      return { access: 'denied' as const, reason: gate.reason };
    }
    const rows = await ctx.db.query('resources').take(2000);
    rows.sort((a, b) => {
      // Published first so the admin's most-common edit target leads the
      // list; drafts and archived sink to the bottom.
      const order = { published: 0, draft: 1, archived: 2 } as const;
      const byStatus = order[a.status] - order[b.status];
      if (byStatus !== 0) return byStatus;
      return a.title.localeCompare(b.title);
    });
    return {
      access: 'allowed' as const,
      resources: rows.map((r) => ({
        _id: r._id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        url: r.url,
        contactEmail: r.contactEmail ?? null,
        category: r.category,
        tags: r.tags ?? [],
        stageTags: r.stageTags ?? [],
        communities: r.communities ?? [],
        industries: r.industries ?? [],
        locations: r.locations ?? [],
        status: r.status,
        sourceId: r.sourceId ?? null,
      })),
    };
  },
});

const resourceFieldsValidator = v.object({
  title: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  category: resourceCategoryValidator,
  tags: v.array(v.string()),
  stageTags: v.array(v.string()),
  communities: v.array(v.string()),
  industries: v.array(v.string()),
  locations: v.array(v.string()),
  status: resourceStatusValidator,
});

function cleanArray(xs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of xs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Create or replace a resource as an admin. `id` omitted ⇒ insert new row;
 * `id` present ⇒ patch in place. Both paths re-derive `searchText`, replace
 * facet rows, and schedule a re-embed so vector search stays aligned with
 * the edit.
 *
 * The slug is derived from `title + sourceId`. For edits we keep the row's
 * existing `sourceId` so a title-only rename produces a deterministic new
 * slug rather than churn from a fresh sourceId.
 */
export const upsertForAdmin = mutation({
  args: {
    id: v.optional(v.id('resources')),
    fields: resourceFieldsValidator,
  },
  returns: v.object({
    _id: v.id('resources'),
    slug: v.string(),
    action: v.union(v.literal('created'), v.literal('updated')),
  }),
  handler: async (ctx, { id, fields }) => {
    await requireAdmin(ctx);

    const title = fields.title.trim();
    const description = fields.description.trim();
    const url = fields.url.trim();
    if (!title) throw new Error('Title is required.');
    if (!description) throw new Error('Description is required.');
    if (!url) throw new Error('URL is required.');
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('URL must start with http:// or https://.');
    }

    const tags = cleanArray(fields.tags);
    const communities = cleanArray(fields.communities);
    const industries = cleanArray(fields.industries);
    const locations = cleanArray(fields.locations);
    // Admin-supplied stage tags win; if they left the field blank, fall
    // back to the same keyword-based inference the import path uses so a
    // resource is never missing stage facets.
    const stageTags = fields.stageTags.length > 0
      ? cleanArray(fields.stageTags)
      : inferStageTagsFromTags(tags);
    const contactEmail = sanitizeContactEmail(fields.contactEmail);

    // sourceId is the upsert key for CSV/submission imports — preserve it
    // on edit so re-running an import never collides with an admin edit.
    // Brand-new admin rows get a synthetic 'admin-…' id so they pass the
    // same dedup checks downstream.
    let resourceId: Id<'resources'>;
    let sourceId: string;
    let action: 'created' | 'updated';

    if (id) {
      const existing = await ctx.db.get(id);
      if (!existing) throw new Error('Resource not found.');
      sourceId = existing.sourceId ?? `admin-${id}`;
      resourceId = id;
      action = 'updated';
    } else {
      sourceId = `admin-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
      action = 'created';
      resourceId = '' as unknown as Id<'resources'>;
    }

    const slug = makeResourceSlug(title, sourceId);
    const searchText = buildSearchText({
      title,
      description,
      url,
      contactEmail,
      category: fields.category,
      communities,
      industries,
      locations,
      tags,
      stageTags,
    });

    const payload = {
      title,
      slug,
      description,
      url,
      contactEmail,
      sourceId,
      communities,
      industries,
      locations,
      category: fields.category,
      tags,
      stageTags,
      searchText,
      status: fields.status,
      lastSyncedAt: Date.now(),
    };

    if (id) {
      await ctx.db.patch(id, payload);
    } else {
      resourceId = await ctx.db.insert('resources', payload);
    }

    await ctx.runMutation(internal.resourceInternal.replaceFacets, {
      resourceId,
      status: fields.status,
      facetRows: facetsFromResourceFields({
        category: fields.category,
        communities,
        industries,
        locations,
        tags,
        stageTags,
      }),
    });

    await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, {
      resourceId,
    });

    return { _id: resourceId, slug, action };
  },
});

/**
 * Flip a resource's lifecycle without re-typing every field. Used for
 * publish/unpublish/archive on the admin list. Facet rows carry their own
 * `status` so it's kept in sync; embeddings get re-emitted with the new
 * status flag for filtered vector search.
 */
export const setStatusForAdmin = mutation({
  args: {
    id: v.id('resources'),
    status: resourceStatusValidator,
  },
  returns: v.null(),
  handler: async (ctx, { id, status }) => {
    await requireAdmin(ctx);
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error('Resource not found.');
    if (existing.status === status) return null;

    await ctx.db.patch(id, { status, lastSyncedAt: Date.now() });

    const facets = await ctx.db
      .query('resourceFacets')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', id))
      .collect();
    for (const f of facets) {
      if (f.status !== status) {
        await ctx.db.patch(f._id, { status });
      }
    }

    const embedding = await ctx.db
      .query('resourceEmbeddings')
      .withIndex('by_resourceId', (q) => q.eq('resourceId', id))
      .unique();
    if (embedding && embedding.status !== status) {
      await ctx.db.patch(embedding._id, { status });
    }

    return null;
  },
});
