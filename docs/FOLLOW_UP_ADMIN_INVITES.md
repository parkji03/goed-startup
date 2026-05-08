# Follow-up: Invite-only admin (deferred scope)

## Current shortcut

Admin-only Convex mutations (CSV import, submission approvals) are guarded by **`requireAdmin()`** reading **`ADMIN_EMAILS`** — a comma-separated allowlist in **Convex dashboard environment variables**, compared to **`ctx.auth.getUserIdentity()?.email`** after JWT auth is configured (`convex/auth.config.ts` + Clerk + `ConvexProviderWithClerk`).

That is sufficient for a controlled demo or small team with known emails, but it is **not** a product-grade “only invited admins” model.

## Desired end state (later)

Replace (or narrow) the env allowlist with a **durable admin identity** tied to your auth provider:

- **Clerk**: invite-only or organization-based access — e.g. no public self-signup for admin surfaces, **Organizations** + roles, invitations, or Backend API–driven enrollment. See [Clerk organizations](https://clerk.com/docs/organizations/overview).
- **Convex**: store admin or role rows keyed by **`identity.tokenIdentifier`** (stable Convex identity key; see [Convex auth in functions](https://docs.convex.dev/auth/functions-auth)), updated when an invite is accepted — typically via a **Clerk webhook** → Convex **mutation** syncing `tokenIdentifier` into a **`userRoles`** or **`admins`** table.
- **`requireAdmin()`** should then check **`ctx.db`** (or a small internal query) instead of parsing `ADMIN_EMAILS`, with an optional env allowlist kept only as emergency break-glass if you want.

Also review **`internal.resourceImport.importInternal`**: internal functions can be invoked from the Convex dashboard; production hardening may mean removing that path or tightening ops access.

## Why we are not doing this now

Implementing invite-only admin properly touches **Clerk product configuration** (sign-up policy, orgs, invitations, possibly multiple applications), **Convex schema + migrations + webhooks**, and **auditability** (who was granted admin, when). That is a meaningful product and security track on its own — **materially broader than** the resource search / guide prototype — and is intentionally scoped out of the current build.

## Checklist when picking this up

1. Decide admin model: Clerk organization + role vs app-level allowlist vs separate “admin” Clerk application.
2. Add Convex tables (`admins` or `userRoles`) keyed by `tokenIdentifier`; migrate if operators previously relied only on `ADMIN_EMAILS`.
3. Implement Clerk webhook (`user.created`, `organizationMembership.created`, or custom invite flow) → Convex sync.
4. Rewrite `requireAdmin()` to use the database (optionally retain `ADMIN_EMAILS` temporarily).
5. Document operational runbook (revoke admin, audit trail, staging vs production Convex deployments).
6. Restrict or remove **`importInternal`** in production if it does not fit your threat model.
