import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation, mutation } from './_generated/server';
import { resourceStatusValidator } from './resourceValidators';

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
});

/**
 * Idempotent upsert of one resource row. Used by **`scripts/seed-resources.ts`** (CSV → Convex),
 * mirroring **`companies.seedOne`**. Intended for bootstrap / staging only — lock behind auth or move
 * to internal-only tooling before broad production exposure.
 */
export const seedUpsertRow = mutation({
  args: {
    row: importRow,
    status: v.optional(resourceStatusValidator),
  },
  handler: async (ctx, { row, status }) => {
    if (!row.url.trim()) return { skipped: true as const };
    const publishStatus = status ?? 'published';
    await ctx.runMutation(internal.resourceInternal.upsertResource, {
      row: {
        ...row,
        status: publishStatus,
      },
    });
    return { skipped: false as const };
  },
});

/**
 * Idempotent bulk import for operators (Convex dashboard → run internal mutations, scripts with
 * convex run, etc.).
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
