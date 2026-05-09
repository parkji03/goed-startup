import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './lib/adminAuth';

/**
 * Companies the caller's user directory has claimers for, joined with
 * the email pulled from the `users` side-table. One row per claimer
 * (collapsed if a single user owns multiple companies). Includes
 * revocation status so the admin UI can show a single combined view.
 *
 * Admin-gated: this leaks email + claim attribution.
 */
export const listClaimers = query({
  args: {},
  returns: v.array(
    v.object({
      tokenIdentifier: v.string(),
      email: v.union(v.string(), v.null()),
      claimedCompanyCount: v.number(),
      claimedCompanyNames: v.array(v.string()),
      revoked: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    // Walk every company with a `claimedBy` set. Convex doesn't support
    // "where field exists", so we filter in memory — fine since the map
    // dataset is small. When this grows past a few thousand rows, swap
    // to an index over `claimedBy` only (already exists as `by_claimedBy`)
    // and iterate the keys.
    const companies = await ctx.db.query('companies').collect();
    const grouped = new Map<string, { names: string[] }>();
    for (const c of companies) {
      if (!c.claimedBy) continue;
      const entry = grouped.get(c.claimedBy) ?? { names: [] };
      entry.names.push(c.name);
      grouped.set(c.claimedBy, entry);
    }

    const result: Array<{
      tokenIdentifier: string;
      email: string | null;
      claimedCompanyCount: number;
      claimedCompanyNames: string[];
      revoked: boolean;
    }> = [];
    for (const [tokenIdentifier, { names }] of grouped) {
      const userRow = await ctx.db
        .query('users')
        .withIndex('by_token', (q) =>
          q.eq('tokenIdentifier', tokenIdentifier),
        )
        .unique();
      const revokedRow = await ctx.db
        .query('revokedUsers')
        .withIndex('by_token', (q) =>
          q.eq('tokenIdentifier', tokenIdentifier),
        )
        .unique();
      result.push({
        tokenIdentifier,
        email: userRow?.email ?? null,
        claimedCompanyCount: names.length,
        claimedCompanyNames: names,
        revoked: revokedRow != null,
      });
    }
    // Stable order: revoked users sink to the bottom, then alphabetical
    // by email so the admin can scan.
    result.sort((a, b) => {
      if (a.revoked !== b.revoked) return a.revoked ? 1 : -1;
      return (a.email ?? '').localeCompare(b.email ?? '');
    });
    return result;
  },
});

/**
 * All currently-revoked users. Admin-gated, indexed by `revokedAt` so
 * the UI can show "most recent first".
 */
export const listRevoked = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('revokedUsers'),
      tokenIdentifier: v.string(),
      email: v.string(),
      reason: v.union(v.string(), v.null()),
      revokedAt: v.number(),
      revokedByEmail: v.string(),
    }),
  ),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query('revokedUsers').collect();
    rows.sort((a, b) => b.revokedAt - a.revokedAt);
    return rows.map((r) => ({
      _id: r._id,
      tokenIdentifier: r.tokenIdentifier,
      email: r.email,
      reason: r.reason ?? null,
      revokedAt: r.revokedAt,
      revokedByEmail: r.revokedByEmail,
    }));
  },
});

/**
 * Revoke a user's access. Two entry shapes — both resolve to a single
 * `tokenIdentifier`:
 *
 *   • `tokenIdentifier` — used by the "Revoke" button on the claimers
 *     list (we already know the key).
 *   • `email` — used by the manual "revoke by email" form. Looks up the
 *     `users` directory; throws if the email hasn't signed in yet
 *     (because we have no key to bind the revocation to).
 *
 * Idempotent on `tokenIdentifier` — if the user's already revoked,
 * returns the existing row id rather than inserting a duplicate.
 */
export const revoke = mutation({
  args: {
    tokenIdentifier: v.optional(v.string()),
    email: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id('revokedUsers'),
    status: v.union(v.literal('revoked'), v.literal('already_revoked')),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    if (!args.tokenIdentifier && !args.email) {
      throw new Error('Provide either tokenIdentifier or email.');
    }

    let tokenIdentifier = args.tokenIdentifier;
    let resolvedEmail = args.email?.trim().toLowerCase() ?? '';

    if (!tokenIdentifier) {
      const userRow = await ctx.db
        .query('users')
        .withIndex('by_email', (q) => q.eq('email', resolvedEmail))
        .unique();
      if (!userRow) {
        throw new Error(
          `No signed-in user found with email "${resolvedEmail}". They need to sign in once before they can be revoked.`,
        );
      }
      tokenIdentifier = userRow.tokenIdentifier;
      resolvedEmail = userRow.email;
    } else if (!resolvedEmail) {
      const userRow = await ctx.db
        .query('users')
        .withIndex('by_token', (q) =>
          q.eq('tokenIdentifier', tokenIdentifier!),
        )
        .unique();
      resolvedEmail = userRow?.email ?? '(unknown)';
    }

    const existing = await ctx.db
      .query('revokedUsers')
      .withIndex('by_token', (q) =>
        q.eq('tokenIdentifier', tokenIdentifier!),
      )
      .unique();
    if (existing) {
      return { id: existing._id, status: 'already_revoked' as const };
    }

    const id = await ctx.db.insert('revokedUsers', {
      tokenIdentifier: tokenIdentifier!,
      email: resolvedEmail,
      reason: args.reason?.trim() || undefined,
      revokedAt: Date.now(),
      revokedBySubject: admin.tokenIdentifier,
      revokedByEmail: admin.email,
    });
    return { id, status: 'revoked' as const };
  },
});

/**
 * Lift a revocation. The user regains portal access on their next
 * `me.getRole` poll (which is sub-second since it's a live subscription).
 */
export const restore = mutation({
  args: { id: v.id('revokedUsers') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return null;
  },
});
