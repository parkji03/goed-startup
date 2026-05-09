import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireAdmin } from './lib/adminAuth';

/**
 * Returns the active admin allowlist split by source so the UI can show
 * which entries are deploy-locked (env vars) vs. runtime-editable (table).
 * Admin-gated — the email list is moderately sensitive and shouldn't leak
 * to anonymous users.
 *
 * Each entry's `value` is the lowercased canonical form used for matching.
 */
export const listAllowlist = query({
  args: {},
  returns: v.object({
    env: v.object({
      emails: v.array(v.string()),
      domains: v.array(v.string()),
    }),
    table: v.array(
      v.object({
        _id: v.id('adminAllowlist'),
        kind: v.union(v.literal('email'), v.literal('domain')),
        value: v.string(),
        note: v.union(v.string(), v.null()),
        addedByEmail: v.string(),
        addedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const envEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const envDomains = (process.env.ADMIN_EMAIL_DOMAINS ?? '')
      .split(',')
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);

    const rows = await ctx.db.query('adminAllowlist').collect();
    rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value));

    return {
      env: { emails: envEmails, domains: envDomains },
      table: rows.map((r) => ({
        _id: r._id,
        kind: r.kind,
        value: r.value,
        note: r.note ?? null,
        addedByEmail: r.addedByEmail,
        addedAt: r.addedAt,
      })),
    };
  },
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Hostnames: labels of [a-z0-9-] separated by dots, no leading/trailing dash,
// 1+ dot. Permissive enough for `goed.utah.gov`, strict enough to reject
// inputs like `@example.com` or `gov`.
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/**
 * Add an entry to the runtime-editable allowlist. No-ops if an env-driven
 * or existing table row already covers the same value, so admins can't
 * create duplicates by accident.
 */
export const addAllowlistEntry = mutation({
  args: {
    kind: v.union(v.literal('email'), v.literal('domain')),
    value: v.string(),
    note: v.optional(v.string()),
  },
  returns: v.object({
    status: v.union(v.literal('added'), v.literal('already_present')),
    id: v.union(v.id('adminAllowlist'), v.null()),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);

    const value = args.value.trim().toLowerCase();
    if (!value) {
      throw new Error('Value cannot be empty.');
    }
    if (args.kind === 'email' && !EMAIL_PATTERN.test(value)) {
      throw new Error(`"${value}" doesn't look like an email address.`);
    }
    if (args.kind === 'domain' && !DOMAIN_PATTERN.test(value)) {
      throw new Error(`"${value}" doesn't look like a domain (e.g. example.com).`);
    }

    // Already present in env? Return idempotently — there's nothing to add.
    const envBlob =
      args.kind === 'email'
        ? process.env.ADMIN_EMAILS
        : process.env.ADMIN_EMAIL_DOMAINS;
    const envSet = new Set(
      (envBlob ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    );
    if (envSet.has(value)) {
      return { status: 'already_present' as const, id: null };
    }

    const existing = await ctx.db
      .query('adminAllowlist')
      .withIndex('by_kind_value', (q) => q.eq('kind', args.kind).eq('value', value))
      .unique();
    if (existing) {
      return { status: 'already_present' as const, id: existing._id };
    }

    const id = await ctx.db.insert('adminAllowlist', {
      kind: args.kind,
      value,
      note: args.note?.trim() || undefined,
      addedBySubject: admin.tokenIdentifier,
      addedByEmail: admin.email,
      addedAt: Date.now(),
    });
    return { status: 'added' as const, id };
  },
});

/**
 * Remove a runtime allowlist row. The admin who's removing the entry is
 * always allowed to do so — there's no "you can't demote yourself" check
 * because the env-var allowlist is the safety floor.
 */
export const removeAllowlistEntry = mutation({
  args: { id: v.id('adminAllowlist') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    await requireAdmin(ctx);
    await ctx.db.delete(id);
    return null;
  },
});
