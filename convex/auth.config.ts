/**
 * Clerk → Convex JWT validation.
 *
 * **`domain`** is your Clerk **Frontend API URL** (e.g. `https://exciting-pup-20.clerk.accounts.dev`).
 * Set **`CLERK_FRONTEND_API_URL`** on your **Convex** deployment, then run `pnpm exec convex dev`.
 *
 * ## Email on the token (for `ctx.auth.getUserIdentity()?.email`)
 *
 * Convex maps the OIDC **`email`** JWT claim to `identity.email`. Clerk’s default session token
 * does **not** include `email` — you must add it in the Dashboard:
 *
 * 1. **[Sessions](https://dashboard.clerk.com/~/sessions)** → **Customize session token** → Claims
 *    editor (JSON). Merge in (do not remove existing claims such as `aud`):
 *    `"email": "{{user.primary_email_address}}"`
 *
 * 2. **If needed:** [JWT templates](https://dashboard.clerk.com/~/jwt-templates) → template named
 *    **`convex`** (used when the session token does not already carry `aud: "convex"`) — add the same
 *    **`email`** claim there.
 *
 * Shortcodes: [JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates).
 * The **Clerk CLI** does not configure these claims — use the Dashboard.
 *
 * @see https://docs.convex.dev/auth/clerk
 * @see https://clerk.com/docs/integration/convex
 */
import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_FRONTEND_API_URL!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
