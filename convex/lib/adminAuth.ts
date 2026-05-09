import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';

export type AdminAccessDeniedReason =
  | 'signed_out'
  | 'missing_email_in_token'
  | 'not_configured'
  | 'not_in_allowlist'
  | 'domain_not_allowed';

export type AdminGateOk = { ok: true; email: string; tokenIdentifier: string };
export type AdminGateDenied = { ok: false; reason: AdminAccessDeniedReason };

/**
 * Convex maps the JWT **`email`** claim to `identity.email`. Clerk’s default session token does not
 * include that OIDC claim — add it in the Clerk Dashboard (see `convex/auth.config.ts` header comment).
 *
 * Also accepts Clerk’s **`primaryEmail`** custom claim if you used that key instead of **`email`**.
 */
function emailFromClerkIdentity(
  identity: NonNullable<Awaited<ReturnType<QueryCtx['auth']['getUserIdentity']>>>,
): string | undefined {
  if (typeof identity.email === 'string' && identity.email.trim()) {
    return identity.email;
  }
  const fallback = (identity as Record<string, unknown>).primaryEmail;
  return typeof fallback === 'string' && fallback.trim() ? fallback : undefined;
}

/**
 * Resolve admin access without throwing (for queries that power `useQuery` UIs).
 */
export async function checkAdminGate(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<AdminGateOk | AdminGateDenied> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return { ok: false, reason: 'signed_out' };
  }
  const email = emailFromClerkIdentity(identity);
  if (!email) {
    return { ok: false, reason: 'missing_email_in_token' };
  }
  // Two-axis allowlist, two sources:
  //   `ADMIN_EMAILS`         — exact, full-address matches (env, locked).
  //   `ADMIN_EMAIL_DOMAINS`  — domain-suffix matches (env, locked).
  //   `adminAllowlist` table — runtime-editable from the admin UI; rows
  //                            are tagged `kind: 'email' | 'domain'` and
  //                            unioned with the env-driven sets at check
  //                            time. The env stays as the founding-admin
  //                            bootstrap so the table can never lock the
  //                            deployment out of itself.
  // A user is admin if any source matches.
  const envEmails =
    process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) ?? [];
  const envDomains =
    process.env.ADMIN_EMAIL_DOMAINS?.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean) ?? [];

  // Table reads only run on Query/Mutation contexts. Actions don't have
  // `ctx.db`, so we narrow with a runtime check — actions still get the
  // env-var path which covers the founding admin.
  const tableEmails = new Set<string>();
  const tableDomains = new Set<string>();
  if ('db' in ctx) {
    const rows = await ctx.db.query('adminAllowlist').collect();
    for (const r of rows) {
      if (r.kind === 'email') tableEmails.add(r.value);
      else tableDomains.add(r.value);
    }
  }

  if (envEmails.length === 0 && envDomains.length === 0 && tableEmails.size === 0 && tableDomains.size === 0) {
    return { ok: false, reason: 'not_configured' };
  }

  const emailLower = email.toLowerCase();
  if (envEmails.includes(emailLower) || tableEmails.has(emailLower)) {
    return { ok: true, email, tokenIdentifier: identity.tokenIdentifier };
  }
  // Domain check: everything after the last `@`. Malformed (no `@`) emails
  // fall through to the deny branch since `domain` won't match any rule.
  const atIndex = emailLower.lastIndexOf('@');
  const domain = atIndex >= 0 ? emailLower.slice(atIndex + 1) : emailLower;
  if (envDomains.includes(domain) || tableDomains.has(domain)) {
    return { ok: true, email, tokenIdentifier: identity.tokenIdentifier };
  }

  // Specific reason helps the UI distinguish "you're not on any email
  // list" from "no email list configured at all".
  const anyEmailRule = envEmails.length > 0 || tableEmails.size > 0;
  return {
    ok: false,
    reason: anyEmailRule ? 'not_in_allowlist' : 'domain_not_allowed',
  };
}

function adminGateDeniedMessage(reason: AdminAccessDeniedReason): string {
  switch (reason) {
    case 'signed_out':
      return 'Unauthorized: sign in to access admin.';
    case 'missing_email_in_token':
      return (
        'Unauthorized: no email on the JWT Convex receives from Clerk. In Clerk Dashboard → Sessions → Customize session token, ' +
        'add claim `"email": "{{user.primary_email_address}}"` (or add the same claim to your `convex` JWT template). ' +
        'See comments in convex/auth.config.ts.'
      );
    case 'not_configured':
      return 'Admin access is not configured (set ADMIN_EMAILS and/or ADMIN_EMAIL_DOMAINS on your Convex deployment).';
    case 'not_in_allowlist':
      return 'Forbidden: signed-in email is not listed in ADMIN_EMAILS and its domain is not in ADMIN_EMAIL_DOMAINS.';
    case 'domain_not_allowed':
      return 'Forbidden: signed-in email\'s domain is not in ADMIN_EMAIL_DOMAINS.';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

/**
 * Comma-separated admin emails in Convex env `ADMIN_EMAILS`.
 * Only these identities may run admin write operations.
 */
export async function requireAdmin(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<{ email: string; tokenIdentifier: string }> {
  const gate = await checkAdminGate(ctx);
  if (!gate.ok) {
    throw new Error(adminGateDeniedMessage(gate.reason));
  }
  return {
    email: gate.email,
    tokenIdentifier: gate.tokenIdentifier,
  };
}
