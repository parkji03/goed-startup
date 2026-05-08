import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server';

export type AdminAccessDeniedReason =
  | 'signed_out'
  | 'missing_email_in_token'
  | 'not_configured'
  | 'not_in_allowlist';

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
  const allowList =
    process.env.ADMIN_EMAILS?.split(',').map((e) => e.trim().toLowerCase()) ?? [];
  if (allowList.length === 0) {
    return { ok: false, reason: 'not_configured' };
  }
  const emailLower = email.toLowerCase();
  if (!allowList.includes(emailLower)) {
    return { ok: false, reason: 'not_in_allowlist' };
  }
  return {
    ok: true,
    email,
    tokenIdentifier: identity.tokenIdentifier,
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
      return 'Admin access is not configured (set ADMIN_EMAILS on your Convex deployment).';
    case 'not_in_allowlist':
      return 'Forbidden: signed-in email is not listed in ADMIN_EMAILS.';
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
