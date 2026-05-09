import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { checkAdminGate } from './lib/adminAuth';

/**
 * Single source of "who am I and what can I do" for the client. Front-end
 * components subscribe to this once and switch chrome (admin link, claim
 * CTAs, revocation gate, etc.) on the result.
 *
 * Roles:
 *   • `anonymous`     — no signed-in identity
 *   • `authenticated` — signed in but not in the admin allowlist
 *   • `admin`         — passes `checkAdminGate` (env or table allowlist)
 *
 * `revoked` is independent of `kind`: it's only ever `true` for
 * `authenticated` users (admins bypass the revoke list — the env-var
 * allowlist is the deploy-side safety floor). When `true`, the client
 * gate pushes the user to `/access-revoked`.
 */
export const getRole = query({
  args: {},
  returns: v.object({
    kind: v.union(
      v.literal('admin'),
      v.literal('authenticated'),
      v.literal('anonymous'),
    ),
    email: v.union(v.string(), v.null()),
    revoked: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { kind: 'anonymous' as const, email: null, revoked: false };
    }
    const gate = await checkAdminGate(ctx);
    const email =
      typeof identity.email === 'string' && identity.email.trim()
        ? identity.email
        : null;

    if (gate.ok) {
      // Admins are never revoked from the portal — env-var allowlist is
      // the deploy-side floor that prevents a moderator from locking
      // themselves out via the runtime table.
      return { kind: 'admin' as const, email, revoked: false };
    }

    const revoked = await ctx.db
      .query('revokedUsers')
      .withIndex('by_token', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique();

    return {
      kind: 'authenticated' as const,
      email,
      revoked: revoked != null,
    };
  },
});

/**
 * Upsert a `users` row for the calling identity. Called once per app
 * mount from the client so the directory stays warm — used by the admin
 * UI to resolve a `tokenIdentifier` → email when surfacing claimers.
 *
 * No-op (returns `null`) for anonymous callers; for authenticated calls
 * without an `email` claim on the JWT (Clerk's session token must be
 * customized — see `convex/auth.config.ts`), we skip writing rather
 * than persist a useless half-row.
 */
export const touch = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const email =
      typeof identity.email === 'string' && identity.email.trim()
        ? identity.email.toLowerCase()
        : null;
    if (!email) return null;

    const now = Date.now();
    const existing = await ctx.db
      .query('users')
      .withIndex('by_token', (q) =>
        q.eq('tokenIdentifier', identity.tokenIdentifier),
      )
      .unique();

    if (existing) {
      // Patch only on drift: skips the write on the common case where
      // nothing's changed since the last touch.
      if (existing.email !== email || now - existing.lastSeenAt > 60_000) {
        await ctx.db.patch(existing._id, { email, lastSeenAt: now });
      }
    } else {
      await ctx.db.insert('users', {
        tokenIdentifier: identity.tokenIdentifier,
        email,
        lastSeenAt: now,
      });
    }

    // Late-bind any approved claim requests for this email. The admin
    // approves a claim while the submitter is still anonymous; the
    // company's `claimedBy` only gets set here, on the user's next
    // sign-in. Idempotent — once `claimedBy` is set, subsequent touches
    // skip these rows.
    const approvedClaims = await ctx.db
      .query('companyClaimRequests')
      .withIndex('by_submitterEmail', (q) => q.eq('submitterEmail', email))
      .collect();
    for (const req of approvedClaims) {
      if (req.status !== 'approved') continue;
      const company = await ctx.db.get(req.companyId);
      if (!company) continue;
      // Don't steal a claim that's already bound to someone else (could
      // happen if two competing approved requests exist; admin resolves).
      if (company.claimedBy && company.claimedBy !== identity.tokenIdentifier) {
        continue;
      }
      if (company.claimedBy === identity.tokenIdentifier) continue;
      await ctx.db.patch(company._id, {
        claimedBy: identity.tokenIdentifier,
        lastEditedAt: now,
      });
    }
    return null;
  },
});
