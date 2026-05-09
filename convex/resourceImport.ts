import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { resourceCategoryValidator, resourceStatusValidator } from './resourceValidators';

const importRow = v.object({
  sourceId: v.string(),
  title: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  communitiesRaw: v.optional(v.string()),
  industriesRaw: v.optional(v.string()),
  locationsRaw: v.optional(v.string()),
  topicsRaw: v.optional(v.string()),
  tagsRaw: v.optional(v.string()),
  category: v.optional(resourceCategoryValidator),
});

/**
 * Idempotent bulk import (internal only — not callable from the browser).
 * Scripts: `pnpm seed:resources`. Dashboard: run `resourceImport:importInternal`.
 */
export const importInternal = internalMutation({
  args: {
    rows: v.array(importRow),
    status: v.optional(resourceStatusValidator),
  },
  handler: async (ctx, { rows, status }) => {
    const publishStatus = status ?? 'published';
    for (const r of rows) {
      if (!r.url.trim()) continue;
      await ctx.runMutation(internal.resourceInternal.upsertResource, {
        row: {
          ...r,
          status: publishStatus,
        },
      });
    }
    return { applied: rows.length };
  },
});
