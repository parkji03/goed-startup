/**
 * Public-facing onboarding endpoints for the map. Two paths:
 *
 *   - `submitRegistration` — a business that isn't on the map asks to be
 *     listed (`/[locale]/register`). Lands in `companySubmissions` with
 *     `status: 'pending'` for admin review.
 *
 *   - `submitClaim` — someone says "this is my company" for an already-listed
 *     row (`/[locale]/claim/[slug]`). Lands in `companyClaimRequests` keyed
 *     to the company's id.
 *
 * Both are anonymous (no `ctx.auth` required). Approval / magic-link binding
 * to `companies.claimedBy` is a separate future flow — these mutations only
 * capture the request.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { Id } from './_generated/dataModel';
import { checkAdminGate, requireAdmin } from './lib/adminAuth';
import { geocodeAddress } from './lib/geocode';
import { adminAccessDeniedReasonValidator } from './resourceValidators';

const CURATED_SECTORS = [
  'b2b-software',
  'consumer',
  'fintech',
  'bio-medical',
  'security',
  'energy',
  'marketplaces',
  'other',
] as const;
type SectorId = (typeof CURATED_SECTORS)[number];

function isCuratedSector(value: string | undefined): value is SectorId {
  return value !== undefined && (CURATED_SECTORS as readonly string[]).includes(value);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function buildSearchText(
  name: string,
  website: string | undefined,
  description: string | undefined,
): string {
  return [name, website, description]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
}

/** Loose URL sanity check — accepts http(s) and bare domains. The admin
 * canonicalizes on approval, so a permissive pass here is fine. */
function looksLikeUrl(value: string): boolean {
  if (!value) return false;
  if (/^https?:\/\//i.test(value)) return true;
  // Bare domain: at least one dot, no spaces, no scheme.
  return /^[^\s/]+\.[^\s/]+/.test(value);
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function looksLikeEmail(value: string): boolean {
  // Same shape we accept on the resource submission form — server-side only
  // as a sanity check, not a strict RFC validator.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Lean public projection of a company for the claim form. Returns only the
 * fields the form needs (name, website, sector for context, isClaimed gate)
 * — never the raw `claimedBy` token, which is owner-private. Returns
 * `null` for unknown slugs so the page can render its own not-found state.
 */
export const claimablePreviewBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const row = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!row) return null;
    return {
      _id: row._id,
      name: row.name,
      slug: row.slug,
      website: row.website,
      sector: row.sector,
      isClaimed: Boolean(row.claimedBy),
    };
  },
});

export const submitRegistration = mutation({
  args: {
    name: v.string(),
    website: v.optional(v.string()),
    description: v.string(),
    sectorRaw: v.optional(v.string()),
    locationRaw: v.string(),
    submitterName: v.string(),
    submitterEmail: v.string(),
    submitterRole: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const description = args.description.trim();
    const locationRaw = args.locationRaw.trim();
    const submitterName = args.submitterName.trim();
    const submitterEmail = normalizeEmail(args.submitterEmail);
    const website = args.website?.trim();

    if (!name) throw new Error('Company name is required.');
    if (!description) throw new Error('Description is required.');
    if (!locationRaw) throw new Error('Location is required.');
    if (!submitterName) throw new Error('Your name is required.');
    if (!looksLikeEmail(submitterEmail)) {
      throw new Error('A valid email is required.');
    }
    if (website && !looksLikeUrl(website)) {
      throw new Error('Website must be a URL or domain.');
    }

    const now = Date.now();
    const id = await ctx.db.insert('companySubmissions', {
      name,
      website: website || undefined,
      description,
      sectorRaw: args.sectorRaw?.trim() || undefined,
      locationRaw,
      submitterName,
      submitterEmail,
      submitterRole: args.submitterRole?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return { submissionId: id };
  },
});

export const submitClaim = mutation({
  args: {
    slug: v.string(),
    submitterName: v.string(),
    submitterEmail: v.string(),
    submitterRole: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const slug = args.slug.trim();
    const submitterName = args.submitterName.trim();
    const submitterEmail = normalizeEmail(args.submitterEmail);
    const submitterRole = args.submitterRole.trim();

    if (!slug) throw new Error('Company is required.');
    if (!submitterName) throw new Error('Your name is required.');
    if (!looksLikeEmail(submitterEmail)) {
      throw new Error('A valid email is required.');
    }
    if (!submitterRole) throw new Error('Your role at the company is required.');

    const company = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!company) {
      throw new Error('That business is not on the map.');
    }
    if (company.claimedBy) {
      // The map UI hides the Claim button for already-claimed rows, so this
      // path only fires on a stale tab or a direct URL hit. Fail loud.
      throw new Error('That business has already been claimed.');
    }

    // Reject duplicate-pending claims from the same email so a refresh
    // doesn't double-submit. Other emails may still file a competing claim
    // — admin disambiguates at approval time.
    const existing = await ctx.db
      .query('companyClaimRequests')
      .withIndex('by_companyId_and_status', (q) =>
        q.eq('companyId', company._id).eq('status', 'pending'),
      )
      .collect();
    if (existing.some((row) => row.submitterEmail === submitterEmail)) {
      return { claimRequestId: existing.find((r) => r.submitterEmail === submitterEmail)!._id, deduped: true };
    }

    const now = Date.now();
    const id = await ctx.db.insert('companyClaimRequests', {
      companyId: company._id,
      companyNameSnapshot: company.name,
      submitterName,
      submitterEmail,
      submitterRole,
      notes: args.notes?.trim() || undefined,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return { claimRequestId: id, deduped: false };
  },
});

// ---------------------------------------------------------------------------
// Admin moderation queue. Mirrors the `resourceSubmissions` pattern:
// `listPending*` returns a discriminated union so the UI can render a
// dedicated access-denied panel without throwing, and the mutations gate
// via `requireAdmin` so denied calls fail loud.
//
// Approval semantics today:
//   - Claim requests: status flip to 'approved' only. Binding the company
//     to a real user (`claimedBy = identity.tokenIdentifier`) requires a
//     magic-link sign-up flow that's still future work.
//   - Registrations: status flip to 'approved' only. Promoting the row to
//     a real `companies` doc still happens via the seed pipeline / manual
//     curation — left out here so admins control sector mapping +
//     geocoding rather than guessing from the raw form.
// ---------------------------------------------------------------------------

export const listPendingClaimsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      return { access: 'denied' as const, reason: gate.reason };
    }
    const rows = await ctx.db
      .query('companyClaimRequests')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('desc')
      .take(100);
    // Hydrate each request with a thin company projection so the admin can
    // see what's being claimed without an extra round-trip per row.
    const claims = await Promise.all(
      rows.map(async (r) => {
        const company = await ctx.db.get(r.companyId);
        return {
          ...r,
          company: company
            ? {
                _id: company._id,
                name: company.name,
                slug: company.slug,
                website: company.website,
                isClaimed: Boolean(company.claimedBy),
              }
            : null,
        };
      }),
    );
    return { access: 'allowed' as const, claims };
  },
});

export const listPendingRegistrationsForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      return { access: 'denied' as const, reason: gate.reason };
    }
    const submissions = await ctx.db
      .query('companySubmissions')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('desc')
      .take(100);
    return { access: 'allowed' as const, submissions };
  },
});

/**
 * Surfaces the same access-denied reason as the listing queries so the UI
 * can render a single banner. Exported so the inbox page can typecheck the
 * shape from one place. Kept inline rather than in resourceValidators.ts
 * because the onboarding pipeline may diverge later.
 */
export const adminAccessDeniedReasonShape = adminAccessDeniedReasonValidator;

export const approveClaim = mutation({
  args: {
    claimRequestId: v.id('companyClaimRequests'),
    moderatorNote: v.optional(v.string()),
  },
  handler: async (ctx, { claimRequestId, moderatorNote }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(claimRequestId);
    if (!row) throw new Error('Claim request not found.');
    if (row.status !== 'pending') {
      throw new Error('Claim request is no longer pending.');
    }
    await ctx.db.patch(claimRequestId, {
      status: 'approved',
      moderatorNote: moderatorNote?.trim() || undefined,
      updatedAt: Date.now(),
    });
  },
});

export const rejectClaim = mutation({
  args: {
    claimRequestId: v.id('companyClaimRequests'),
    reason: v.string(),
  },
  handler: async (ctx, { claimRequestId, reason }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(claimRequestId);
    if (!row) throw new Error('Claim request not found.');
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('Rejection reason is required.');
    await ctx.db.patch(claimRequestId, {
      status: 'rejected',
      moderatorNote: trimmed,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Approving a registration is the only path that creates a real
 * `companies` row from a public submission. It's an action because we
 * geocode the submitter's free-form `locationRaw` via the Mapbox API
 * (network call), then call an internal mutation to do all DB writes
 * atomically (insert the company + flip the submission status + record
 * the merged-into id).
 *
 * Geocoding failure is non-fatal: we still publish the company with
 * `lat/lng` undefined, which excludes it from the map but lets the admin
 * fix coordinates manually. Without that fallback, a bad address string
 * would block approval entirely.
 */
export const approveRegistration = action({
  args: {
    submissionId: v.id('companySubmissions'),
    moderatorNote: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { submissionId, moderatorNote },
  ): Promise<{ companyId: Id<'companies'>; slug: string; geocoded: boolean }> => {
    // Re-assert admin auth from the action context. The internal mutation
    // skips a second auth check since only this action can call it.
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      throw new Error(`Admin access required (${gate.reason}).`);
    }

    const submission = await ctx.runQuery(
      internal.companyOnboarding._readPendingSubmission,
      { submissionId },
    );

    const geocoded = await geocodeAddress(submission.locationRaw);

    return await ctx.runMutation(
      internal.companyOnboarding._finalizeRegistrationApproval,
      {
        submissionId,
        moderatorNote: moderatorNote?.trim() || undefined,
        geocoded,
      },
    );
  },
});

/**
 * Pre-flight read used by the approve action so it can short-circuit on
 * stale submissions without paying the geocode cost. Internal because the
 * approval action is the only legitimate caller.
 */
export const _readPendingSubmission = internalQuery({
  args: { submissionId: v.id('companySubmissions') },
  handler: async (ctx, { submissionId }) => {
    const row = await ctx.db.get(submissionId);
    if (!row) throw new Error('Submission not found.');
    if (row.status !== 'pending') {
      throw new Error('Submission is no longer pending.');
    }
    return {
      _id: row._id,
      name: row.name,
      website: row.website,
      description: row.description,
      sectorRaw: row.sectorRaw,
      locationRaw: row.locationRaw,
    };
  },
});

/**
 * Atomic write phase for `approveRegistration`: re-reads the submission
 * inside the transaction, picks an unused slug, inserts the company, and
 * flips the submission to `approved` with a pointer back to the new
 * company. Internal — only `approveRegistration` should call this.
 */
export const _finalizeRegistrationApproval = internalMutation({
  args: {
    submissionId: v.id('companySubmissions'),
    moderatorNote: v.optional(v.string()),
    geocoded: v.union(
      v.null(),
      v.object({
        lng: v.number(),
        lat: v.number(),
        city: v.optional(v.string()),
        county: v.optional(v.string()),
        state: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { submissionId, moderatorNote, geocoded }) => {
    const submission = await ctx.db.get(submissionId);
    if (!submission) throw new Error('Submission not found.');
    if (submission.status !== 'pending') {
      throw new Error('Submission is no longer pending.');
    }

    // Pick a free slug: try the bare slugified name first, then `-2`, `-3`…
    // up to 10 attempts. Extremely unlikely to collide past `-2` for our
    // dataset; the hard cap is just a guard against pathological inputs.
    const baseSlug = slugify(submission.name) || 'company';
    let slug = baseSlug;
    for (let suffix = 2; suffix <= 10; suffix++) {
      const collision = await ctx.db
        .query('companies')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique();
      if (!collision) break;
      slug = `${baseSlug}-${suffix}`;
    }

    const website = normalizeWebsite(submission.website);
    const sector: SectorId = isCuratedSector(submission.sectorRaw)
      ? submission.sectorRaw
      : 'other';

    const now = Date.now();
    const companyId = await ctx.db.insert('companies', {
      name: submission.name,
      slug,
      description: submission.description,
      website,
      searchText: buildSearchText(submission.name, website, submission.description),
      sector,
      location: {
        rawAddress: submission.locationRaw,
        city: geocoded?.city,
        county: geocoded?.county,
        state: geocoded?.state,
        lng: geocoded?.lng,
        lat: geocoded?.lat,
      },
      photos: [],
      // Published immediately. Approval is the gate; further edits go
      // through the owner dashboard once the claim flow binds an owner.
      status: 'published',
      hiringStatus: 'unknown',
      lastEditedAt: now,
      diffLog: [],
    });

    await ctx.db.patch(submissionId, {
      status: 'approved',
      moderatorNote,
      mergedIntoCompanyId: companyId,
      updatedAt: now,
    });

    return { companyId, slug, geocoded: geocoded != null };
  },
});

export const rejectRegistration = mutation({
  args: {
    submissionId: v.id('companySubmissions'),
    reason: v.string(),
  },
  handler: async (ctx, { submissionId, reason }) => {
    await requireAdmin(ctx);
    const row = await ctx.db.get(submissionId);
    if (!row) throw new Error('Submission not found.');
    const trimmed = reason.trim();
    if (!trimmed) throw new Error('Rejection reason is required.');
    await ctx.db.patch(submissionId, {
      status: 'rejected',
      moderatorNote: trimmed,
      updatedAt: Date.now(),
    });
  },
});
