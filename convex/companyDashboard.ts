/**
 * Owner-facing dashboard for claimed companies.
 *
 * Auth contract: a user can edit a company if either
 *
 *   1. `companies.claimedBy` matches their `tokenIdentifier`, or
 *   2. they pass the admin gate (`checkAdminGate`).
 *
 * Both paths flow through `assertCanEditCompany` so every mutation gates
 * the same way.
 *
 * `tokenIdentifier` (issuer + subject) is the canonical identity key per
 * Convex auth guidelines — never `subject` alone.
 */
import { v } from 'convex/values';
import { internal } from './_generated/api';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import {
  employeeCountValidator,
  hiringStatusValidator,
  monetizationModelValidator,
  sectorValidator,
  stageValidator,
  targetMarketValidator,
} from './schema';
import type { Doc, Id } from './_generated/dataModel';
import { checkAdminGate } from './lib/adminAuth';
import { geocodeAddress } from './lib/geocode';

/**
 * Shape of an investor-brief patch. Mirrors `investorBriefValidator` from
 * the schema but strips every `sourceQuote` field and the AI-provenance
 * fields (`pagesCrawled`, `flags`, `extractedAt`). Once an owner edits the
 * brief, the data no longer traces back to a website crawl, so we drop
 * the provenance signals server-side. The diff log carries the human
 * audit trail going forward.
 */
const investorBriefPatchValidator = v.object({
  pitch: v.optional(v.string()),
  productCategory: v.optional(v.string()),
  targetMarket: v.optional(targetMarketValidator),
  monetizationModel: v.optional(monetizationModelValidator),
  openRoleCount: v.optional(v.number()),
  differentiationClaim: v.optional(
    v.object({
      claim: v.string(),
    }),
  ),
  founders: v.optional(
    v.array(
      v.object({
        name: v.string(),
        title: v.optional(v.string()),
        priorCompanies: v.optional(v.array(v.string())),
      }),
    ),
  ),
  notableCustomers: v.optional(v.array(v.string())),
  keyMetrics: v.optional(
    v.array(
      v.object({
        metric: v.string(),
        value: v.string(),
      }),
    ),
  ),
  integrations: v.optional(v.array(v.string())),
  funding: v.optional(
    v.object({
      round: v.optional(v.string()),
      amountUsd: v.optional(v.number()),
      leadInvestor: v.optional(v.string()),
    }),
  ),
});

/**
 * Allowlist of fields the editor (owner or admin) may patch through the
 * dashboard. Anything outside this set — `claimedBy`, `slug`, `status`,
 * `diffLog`, `lastEditedAt`, raw location coords, photos, search index
 * — stays governance-only.
 *
 * `v.optional` everywhere because callers send a partial patch.
 */
const editableCompanyPatchValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  website: v.optional(v.string()),
  linkedin: v.optional(v.string()),
  sector: v.optional(sectorValidator),
  stage: v.optional(stageValidator),
  employeeCount: v.optional(employeeCountValidator),
  yearFounded: v.optional(v.number()),
  hiringStatus: v.optional(hiringStatusValidator),
  // Full-replacement brief patch. If present, the entire `investorBrief`
  // object on the company is rewritten — see `applyInvestorBriefPatch`.
  investorBrief: v.optional(investorBriefPatchValidator),
});

type EditableCompanyPatch = {
  name?: string;
  description?: string;
  website?: string;
  linkedin?: string;
  sector?: Doc<'companies'>['sector'];
  stage?: Doc<'companies'>['stage'];
  employeeCount?: Doc<'companies'>['employeeCount'];
  yearFounded?: number;
  hiringStatus?: Doc<'companies'>['hiringStatus'];
  investorBrief?: InvestorBriefPatch;
};

type InvestorBriefPatch = {
  pitch?: string;
  productCategory?: string;
  targetMarket?: Doc<'companies'>['investorBrief'] extends infer B
    ? B extends { targetMarket?: infer T }
      ? T
      : never
    : never;
  monetizationModel?: Doc<'companies'>['investorBrief'] extends infer B
    ? B extends { monetizationModel?: infer T }
      ? T
      : never
    : never;
  openRoleCount?: number;
  differentiationClaim?: { claim: string };
  founders?: Array<{ name: string; title?: string; priorCompanies?: string[] }>;
  notableCustomers?: string[];
  keyMetrics?: Array<{ metric: string; value: string }>;
  integrations?: string[];
  funding?: { round?: string; amountUsd?: number; leadInvestor?: string };
};

/**
 * Resolve the calling user's stable identity. Returns `null` for unauth'd
 * callers so queries can render an empty state without throwing.
 */
async function callerTokenIdentifier(
  ctx: QueryCtx | MutationCtx,
): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
}

/**
 * Mirror of `buildSearchText` in `convex/companies.ts`. Duplicated rather
 * than imported so this module stays merge-isolated from the parallel
 * claim branch.
 */
function buildSearchText(
  name: string,
  website: string | undefined,
  description: string | undefined,
  listingTitles: string[],
): string {
  const titles = listingTitles.length ? listingTitles.join(' ') : undefined;
  return [name, website, description, titles]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(' ');
}

/**
 * Shared editor gate: caller must be the company owner OR an admin.
 * Returns the resolved identity + `mode` so callers can attribute the
 * diff log entry, and so the query layer can surface "editing as admin"
 * to the UI. Throws on missing identity or denied access.
 */
async function assertCanEditCompany(
  ctx: MutationCtx,
  companyId: Id<'companies'>,
): Promise<{
  company: Doc<'companies'>;
  tokenIdentifier: string;
  mode: 'owner' | 'admin';
}> {
  const tokenIdentifier = await callerTokenIdentifier(ctx);
  if (!tokenIdentifier) throw new Error('Not signed in.');

  const company = await ctx.db.get(companyId);
  if (!company) throw new Error('Company not found.');

  if (company.claimedBy === tokenIdentifier) {
    return { company, tokenIdentifier, mode: 'owner' };
  }
  const gate = await checkAdminGate(ctx);
  if (gate.ok) {
    return { company, tokenIdentifier, mode: 'admin' };
  }
  throw new Error('You do not have permission to edit this company.');
}

/**
 * Companies the signed-in user has claimed. Returns `[]` for
 * unauthenticated callers so the dashboard renders a clean empty state
 * without an error path.
 */
export const myClaimedCompanies = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) return [];
    return await ctx.db
      .query('companies')
      .withIndex('by_claimedBy', (q) => q.eq('claimedBy', tokenIdentifier))
      .collect();
  },
});

/**
 * Single company by slug if the caller can edit it (owner OR admin).
 * Returns `null` if the slug doesn't exist or the caller isn't allowed
 * — same shape so the UI can render a single not-found state without
 * leaking whether a slug exists to a non-permitted user.
 *
 * `mode` lets the dashboard render an "editing as admin" indicator
 * when a non-owner admin lands on the page.
 */
export const myCompanyBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) return null;
    const row = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!row) return null;
    if (row.claimedBy === tokenIdentifier) {
      return { company: row, mode: 'owner' as const };
    }
    const gate = await checkAdminGate(ctx);
    if (gate.ok) {
      return { company: row, mode: 'admin' as const };
    }
    return null;
  },
});

/**
 * Admin-only browse view: every company in the system, lean projection
 * for a flat list. Returns the same `access: 'allowed' | 'denied'`
 * shape as the other admin queries so the UI can render an access
 * banner without throwing.
 *
 * Each row carries `isClaimed` (boolean only — never the raw
 * `claimedBy` token) plus an optional `claimerEmail` resolved through
 * the `users` directory so the table can show "claimed by foo@bar.com".
 */
export const listAllForAdmin = query({
  args: {},
  handler: async (ctx) => {
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      return { access: 'denied' as const, reason: gate.reason };
    }
    const rows = await ctx.db.query('companies').collect();
    // Resolve claimer emails in one pass — `users` is keyed by
    // tokenIdentifier, so each unique token is a single indexed lookup.
    const tokenToEmail = new Map<string, string>();
    const uniqueTokens = Array.from(
      new Set(rows.map((r) => r.claimedBy).filter((t): t is string => Boolean(t))),
    );
    for (const token of uniqueTokens) {
      const u = await ctx.db
        .query('users')
        .withIndex('by_token', (q) => q.eq('tokenIdentifier', token))
        .unique();
      if (u) tokenToEmail.set(token, u.email);
    }
    const companies = rows
      .map((r) => ({
        _id: r._id,
        name: r.name,
        slug: r.slug,
        sector: r.sector,
        status: r.status,
        isClaimed: Boolean(r.claimedBy),
        claimerEmail: r.claimedBy ? (tokenToEmail.get(r.claimedBy) ?? null) : null,
        lastEditedAt: r.lastEditedAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { access: 'allowed' as const, companies };
  },
});

/**
 * Edit history for one company. Returns the same `null` shape as
 * `myCompanyListings` for callers without permission so the privacy
 * stance is uniform.
 *
 * Each entry is enriched with the editor's email (via the `users`
 * directory) and the parsed `mode` ('owner' | 'admin' | 'unknown' for
 * pre-mode-tagging entries). Field-level diff summary comes from a
 * cheap parse of the JSON payload — admins can drill into the raw
 * payload via the Convex dashboard if a deeper audit is needed.
 *
 * Newest-first.
 */
export const myCompanyHistory = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) return null;
    const company = await ctx.db.get(companyId);
    if (!company) return null;

    const isOwner = company.claimedBy === tokenIdentifier;
    if (!isOwner) {
      const gate = await checkAdminGate(ctx);
      if (!gate.ok) return null;
    }

    // Resolve token → email once per unique editor so a 50-entry log
    // doesn't generate 50 lookups for the same person.
    const tokenToEmail = new Map<string, string>();
    const uniqueTokens = Array.from(
      new Set(
        company.diffLog
          .map((d) => d.userId)
          .filter((t): t is string => Boolean(t)),
      ),
    );
    for (const token of uniqueTokens) {
      const u = await ctx.db
        .query('users')
        .withIndex('by_token', (q) => q.eq('tokenIdentifier', token))
        .unique();
      if (u) tokenToEmail.set(token, u.email);
    }

    return company.diffLog
      .map((d) => {
        let mode: 'owner' | 'admin' | 'unknown' = 'unknown';
        let changedFields: string[] = [];
        try {
          const parsed = JSON.parse(d.changes) as Record<string, unknown>;
          if (parsed.mode === 'owner' || parsed.mode === 'admin') {
            mode = parsed.mode;
          }
          changedFields = Object.keys(parsed).filter((k) => k !== 'mode');
        } catch {
          // Malformed JSON — leave defaults. Won't happen for entries
          // written by `updateMyCompany`, but pre-existing rows could
          // theoretically carry anything.
        }
        return {
          timestamp: d.timestamp,
          mode,
          editorEmail: d.userId ? (tokenToEmail.get(d.userId) ?? null) : null,
          changedFields,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  },
});

/**
 * Listings for a company the caller can edit. Returns `null` if the
 * caller isn't allowed (mirrors `myCompanyBySlug`'s privacy stance).
 * Newest-first — UX matches the public detail panel.
 */
export const myCompanyListings = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) return null;
    const company = await ctx.db.get(companyId);
    if (!company) return null;

    const isOwner = company.claimedBy === tokenIdentifier;
    if (!isOwner) {
      const gate = await checkAdminGate(ctx);
      if (!gate.ok) return null;
    }

    return await ctx.db
      .query('companyJobPostings')
      .withIndex('by_companyId_and_postedAt', (q) =>
        q.eq('companyId', companyId),
      )
      .order('desc')
      .take(100);
  },
});

/**
 * Apply an editor-authored patch. Reasserts permission, patches only
 * allowlisted fields, rebuilds `searchText` if any indexed field
 * changed, and appends a diff entry annotated with whether the editor
 * was the owner or an admin.
 *
 * Investor-brief edits clear the AI provenance signals
 * (`pagesCrawled`, `flags`, `extractedAt`, all `sourceQuote`s) — once a
 * human writes to the brief, the data no longer traces back to the
 * crawl.
 */
export const updateMyCompany = mutation({
  args: {
    companyId: v.id('companies'),
    patch: editableCompanyPatchValidator,
  },
  handler: async (ctx, { companyId, patch }) => {
    const { company, tokenIdentifier, mode } = await assertCanEditCompany(
      ctx,
      companyId,
    );

    const cleaned = stripUnchangedFields(company, patch);
    if (Object.keys(cleaned).length === 0) {
      return { _id: company._id, changed: [] as string[], mode };
    }

    const writePayload: Record<string, unknown> = { ...cleaned };

    // Investor brief is patched as a full-replacement object (no merge).
    // The form sends back the desired complete brief shape; we just
    // strip provenance and write it.
    if (cleaned.investorBrief !== undefined) {
      writePayload.investorBrief = applyInvestorBriefPatch(cleaned.investorBrief);
    }

    // Rebuild searchText only if a field that contributes to it changed.
    const searchTextAffected =
      cleaned.name !== undefined ||
      cleaned.website !== undefined ||
      cleaned.description !== undefined;
    if (searchTextAffected) {
      const listings = await ctx.db
        .query('companyJobPostings')
        .withIndex('by_companyId', (q) => q.eq('companyId', company._id))
        .collect();
      writePayload.searchText = buildSearchText(
        cleaned.name ?? company.name,
        cleaned.website ?? company.website,
        cleaned.description ?? company.description,
        listings.map((l) => l.title),
      );
    }

    const now = Date.now();
    writePayload.lastEditedAt = now;
    writePayload.diffLog = [
      ...company.diffLog,
      {
        userId: tokenIdentifier,
        timestamp: now,
        // Diff carries the editor mode so admin edits are visibly
        // distinct from owner edits in the audit trail.
        changes: JSON.stringify({ mode, ...cleaned }),
      },
    ];

    await ctx.db.patch(company._id, writePayload);
    return { _id: company._id, changed: Object.keys(cleaned), mode };
  },
});

/**
 * Address edits live on a separate save path because re-geocoding is an
 * HTTP call (Mapbox), and a Convex mutation can't `fetch`. The action does
 * a fail-fast permission check via internal query, hits Mapbox, then
 * delegates the DB write to an internal mutation that re-asserts auth.
 *
 * Geocoding failure is non-fatal — same fallback as `approveRegistration`:
 * the row keeps the new `rawAddress` with `lat/lng` undefined, which drops
 * it off the map until coords are fixed. The UI should surface that.
 */
export const updateMyCompanyLocation = action({
  args: {
    companyId: v.id('companies'),
    rawAddress: v.string(),
  },
  handler: async (
    ctx,
    { companyId, rawAddress },
  ): Promise<{
    _id: Id<'companies'>;
    changed: boolean;
    geocoded: boolean;
    mode: 'owner' | 'admin';
  }> => {
    const trimmed = rawAddress.trim();
    if (!trimmed) throw new Error('Address is required.');

    const precheck = await ctx.runQuery(
      internal.companyDashboard._readCompanyForLocationEdit,
      { companyId },
    );
    if (precheck.currentRawAddress === trimmed) {
      return {
        _id: companyId,
        changed: false,
        geocoded: false,
        mode: precheck.mode,
      };
    }

    const geocoded = await geocodeAddress(trimmed);

    return await ctx.runMutation(
      internal.companyDashboard._writeLocation,
      { companyId, rawAddress: trimmed, geocoded },
    );
  },
});

/**
 * Pre-flight read used by `updateMyCompanyLocation`. Throws on missing
 * permission so the action can fail before paying the Mapbox round trip,
 * and surfaces the existing rawAddress + caller mode so the action can
 * short-circuit on no-op edits.
 */
export const _readCompanyForLocationEdit = internalQuery({
  args: { companyId: v.id('companies') },
  handler: async (
    ctx,
    { companyId },
  ): Promise<{ currentRawAddress: string; mode: 'owner' | 'admin' }> => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) throw new Error('Not signed in.');
    const company = await ctx.db.get(companyId);
    if (!company) throw new Error('Company not found.');

    if (company.claimedBy === tokenIdentifier) {
      return { currentRawAddress: company.location.rawAddress, mode: 'owner' };
    }
    const gate = await checkAdminGate(ctx);
    if (!gate.ok) {
      throw new Error('You do not have permission to edit this company.');
    }
    return { currentRawAddress: company.location.rawAddress, mode: 'admin' };
  },
});

/**
 * Atomic write phase for location edits. Re-asserts permission inside the
 * transaction (defense-in-depth even though only the action calls this),
 * patches `location` wholesale (rawAddress + geocoded fields, with coords
 * cleared if the geocode failed), and appends a diff entry tagged with
 * the editor mode so admin edits stay distinguishable in the audit log.
 */
export const _writeLocation = internalMutation({
  args: {
    companyId: v.id('companies'),
    rawAddress: v.string(),
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
  handler: async (ctx, { companyId, rawAddress, geocoded }) => {
    const { company, tokenIdentifier, mode } = await assertCanEditCompany(
      ctx,
      companyId,
    );
    const now = Date.now();
    await ctx.db.patch(company._id, {
      location: {
        rawAddress,
        city: geocoded?.city,
        county: geocoded?.county,
        state: geocoded?.state,
        lng: geocoded?.lng,
        lat: geocoded?.lat,
      },
      lastEditedAt: now,
      diffLog: [
        ...company.diffLog,
        {
          userId: tokenIdentifier,
          timestamp: now,
          changes: JSON.stringify({
            mode,
            location: { rawAddress, geocoded: geocoded != null },
          }),
        },
      ],
    });
    return {
      _id: company._id,
      changed: true,
      geocoded: geocoded != null,
      mode,
    };
  },
});

/**
 * Build the writable `investorBrief` object from an owner-authored
 * patch. The patch validator already excludes provenance fields, so
 * this mostly normalizes empty values; nothing from the patch carries
 * sourceQuotes.
 */
function applyInvestorBriefPatch(
  patch: InvestorBriefPatch,
): Doc<'companies'>['investorBrief'] {
  const next: NonNullable<Doc<'companies'>['investorBrief']> = {};
  if (patch.pitch?.trim()) next.pitch = patch.pitch.trim();
  if (patch.productCategory?.trim()) {
    next.productCategory = patch.productCategory.trim();
  }
  if (patch.targetMarket) next.targetMarket = patch.targetMarket;
  if (patch.monetizationModel) next.monetizationModel = patch.monetizationModel;
  if (typeof patch.openRoleCount === 'number') {
    next.openRoleCount = patch.openRoleCount;
  }
  if (patch.differentiationClaim?.claim?.trim()) {
    next.differentiationClaim = { claim: patch.differentiationClaim.claim.trim() };
  }
  if (patch.founders) {
    next.founders = patch.founders
      .filter((f) => f.name.trim().length > 0)
      .map((f) => ({
        name: f.name.trim(),
        title: f.title?.trim() || undefined,
        priorCompanies: f.priorCompanies?.length
          ? f.priorCompanies.map((p) => p.trim()).filter(Boolean)
          : undefined,
      }));
  }
  if (patch.notableCustomers) {
    next.notableCustomers = patch.notableCustomers
      .map((c) => c.trim())
      .filter(Boolean);
  }
  if (patch.keyMetrics) {
    next.keyMetrics = patch.keyMetrics
      .filter((m) => m.metric.trim() && m.value.trim())
      .map((m) => ({
        metric: m.metric.trim(),
        value: m.value.trim(),
        // Required by the validator; empty string signals "human-edited,
        // no source quote retained".
        sourceQuote: '',
      }));
  }
  if (patch.integrations) {
    next.integrations = patch.integrations.map((i) => i.trim()).filter(Boolean);
  }
  if (patch.funding) {
    next.funding = {
      round: patch.funding.round?.trim() || undefined,
      amountUsd: patch.funding.amountUsd,
      leadInvestor: patch.funding.leadInvestor?.trim() || undefined,
    };
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

/**
 * Drop fields whose value matches the existing doc — a no-op edit
 * shouldn't append a diff entry or rebuild searchText. Treats `''` as
 * `undefined` for optional string fields. For `investorBrief` we always
 * pass the patch through (even if structurally identical) since the
 * full-replacement semantics are easier to reason about than deep
 * equality.
 */
function stripUnchangedFields(
  row: Doc<'companies'>,
  patch: EditableCompanyPatch,
): EditableCompanyPatch {
  const cleaned: EditableCompanyPatch = {};
  for (const [key, raw] of Object.entries(patch) as [
    keyof EditableCompanyPatch,
    EditableCompanyPatch[keyof EditableCompanyPatch],
  ][]) {
    if (raw === undefined) continue;
    if (key === 'investorBrief') {
      // Always include — no structural diff for nested briefs.
      cleaned.investorBrief = raw as InvestorBriefPatch;
      continue;
    }
    const next = typeof raw === 'string' && raw.trim() === '' ? undefined : raw;
    const current = (row as Record<string, unknown>)[key];
    if (next === current) continue;
    if (next === undefined && current === undefined) continue;
    // @ts-expect-error narrow assignment from heterogeneous union
    cleaned[key] = next;
  }
  return cleaned;
}

// ---------------------------------------------------------------------------
// Job listings CRUD. Owners (and admins) can add, edit, or delete any
// listing on their company. LinkedIn-sourced rows can be edited too — the
// UI surfaces a warning that the seed pipeline will overwrite them on
// next re-run, since `seedOne` replaces the listing set wholesale when it
// runs against a company.
// ---------------------------------------------------------------------------

/** Shared writer for the denormalized count field on `companies`. */
async function refreshOpenListingsCount(
  ctx: MutationCtx,
  companyId: Id<'companies'>,
): Promise<void> {
  const all = await ctx.db
    .query('companyJobPostings')
    .withIndex('by_companyId', (q) => q.eq('companyId', companyId))
    .collect();
  await ctx.db.patch(companyId, { openListingsCount: all.length });
}

export const createMyListing = mutation({
  args: {
    companyId: v.id('companies'),
    title: v.string(),
    url: v.string(),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, { companyId, title, url, department, location }) => {
    await assertCanEditCompany(ctx, companyId);
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle) throw new Error('Title is required.');
    if (!trimmedUrl) throw new Error('URL is required.');
    const now = Date.now();
    const id = await ctx.db.insert('companyJobPostings', {
      companyId,
      source: 'manual',
      title: trimmedTitle,
      url: trimmedUrl,
      department: department?.trim() || undefined,
      location: location?.trim() || undefined,
      postedAt: now,
      scrapedAt: now,
    });
    await refreshOpenListingsCount(ctx, companyId);
    return { _id: id };
  },
});

export const updateMyListing = mutation({
  args: {
    listingId: v.id('companyJobPostings'),
    title: v.optional(v.string()),
    url: v.optional(v.string()),
    department: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const listing = await ctx.db.get(args.listingId);
    if (!listing) throw new Error('Listing not found.');
    await assertCanEditCompany(ctx, listing.companyId);

    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) {
      const t = args.title.trim();
      if (!t) throw new Error('Title cannot be empty.');
      patch.title = t;
    }
    if (args.url !== undefined) {
      const u = args.url.trim();
      if (!u) throw new Error('URL cannot be empty.');
      patch.url = u;
    }
    if (args.department !== undefined) {
      patch.department = args.department.trim() || undefined;
    }
    if (args.location !== undefined) {
      patch.location = args.location.trim() || undefined;
    }
    if (Object.keys(patch).length === 0) return { _id: args.listingId };
    await ctx.db.patch(args.listingId, patch);
    return { _id: args.listingId };
  },
});

export const deleteMyListing = mutation({
  args: { listingId: v.id('companyJobPostings') },
  handler: async (ctx, { listingId }) => {
    const listing = await ctx.db.get(listingId);
    if (!listing) return { _id: listingId };
    await assertCanEditCompany(ctx, listing.companyId);
    await ctx.db.delete(listingId);
    await refreshOpenListingsCount(ctx, listing.companyId);
    return { _id: listingId };
  },
});

// ---------------------------------------------------------------------------
// Photos. Convex storage holds the files; `companies.photos` is an array
// of `Id<'_storage'>` references. Upload pattern (per Convex docs):
//   1. Client calls `generatePhotoUploadUrl` to get a short-lived URL.
//   2. Client POSTs the file directly to that URL — Convex returns the
//      `storageId` in the response.
//   3. Client calls `attachPhoto` with that `storageId` so the company
//      doc gains a reference to the uploaded blob.
//
// `deletePhoto` removes both the doc reference and the underlying blob.
// ---------------------------------------------------------------------------

/**
 * Soft cap on how many photos a single company can hold. Prevents an
 * accidental drag-the-whole-folder upload from blowing up doc size.
 * Adjustable; the schema validator on `companies.photos` does not
 * enforce a count.
 */
const MAX_PHOTOS_PER_COMPANY = 10;

export const generatePhotoUploadUrl = mutation({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) => {
    const { company } = await assertCanEditCompany(ctx, companyId);
    if (company.photos.length >= MAX_PHOTOS_PER_COMPANY) {
      throw new Error(
        `Photo limit reached (${MAX_PHOTOS_PER_COMPANY}). Delete an existing photo first.`,
      );
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const attachPhoto = mutation({
  args: {
    companyId: v.id('companies'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { companyId, storageId }) => {
    const { company, tokenIdentifier, mode } = await assertCanEditCompany(
      ctx,
      companyId,
    );

    // Idempotent — a retried call shouldn't double-add the same blob.
    if (company.photos.includes(storageId)) {
      return { _id: company._id, photoCount: company.photos.length };
    }
    if (company.photos.length >= MAX_PHOTOS_PER_COMPANY) {
      // The blob already lives in storage at this point; nothing in the
      // company doc references it, so it's an orphan. Schedule a cleanup.
      await ctx.storage.delete(storageId);
      throw new Error(
        `Photo limit reached (${MAX_PHOTOS_PER_COMPANY}). Delete an existing photo first.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(company._id, {
      photos: [...company.photos, storageId],
      lastEditedAt: now,
      diffLog: [
        ...company.diffLog,
        {
          userId: tokenIdentifier,
          timestamp: now,
          changes: JSON.stringify({ mode, photos: { added: 1 } }),
        },
      ],
    });
    return {
      _id: company._id,
      photoCount: company.photos.length + 1,
    };
  },
});

export const deletePhoto = mutation({
  args: {
    companyId: v.id('companies'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { companyId, storageId }) => {
    const { company, tokenIdentifier, mode } = await assertCanEditCompany(
      ctx,
      companyId,
    );
    if (!company.photos.includes(storageId)) {
      // Already detached — also drop the blob if it's hanging around.
      await ctx.storage.delete(storageId).catch(() => {});
      return { _id: company._id, photoCount: company.photos.length };
    }

    const remaining = company.photos.filter((id) => id !== storageId);
    const now = Date.now();
    await ctx.db.patch(company._id, {
      photos: remaining,
      lastEditedAt: now,
      diffLog: [
        ...company.diffLog,
        {
          userId: tokenIdentifier,
          timestamp: now,
          changes: JSON.stringify({ mode, photos: { removed: 1 } }),
        },
      ],
    });
    // Best-effort blob delete — if it's already gone (e.g. another
    // session deleted it), don't fail the doc-update path.
    await ctx.storage.delete(storageId).catch(() => {});
    return { _id: company._id, photoCount: remaining.length };
  },
});

/**
 * Photo URLs for one company, scoped to a caller who can edit it.
 * Mirrors the privacy stance of the other `myCompany*` queries —
 * returns `null` for callers without permission.
 *
 * Each row carries the resolved `url` (signed, time-limited) plus the
 * raw `storageId` so the UI can call `deletePhoto` without a separate
 * lookup. URLs are generated server-side per request, so they're never
 * cached longer than the query subscription.
 */
export const myCompanyPhotos = query({
  args: { companyId: v.id('companies') },
  handler: async (ctx, { companyId }) => {
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) return null;
    const company = await ctx.db.get(companyId);
    if (!company) return null;

    const isOwner = company.claimedBy === tokenIdentifier;
    if (!isOwner) {
      const gate = await checkAdminGate(ctx);
      if (!gate.ok) return null;
    }

    return await Promise.all(
      company.photos.map(async (storageId) => ({
        storageId,
        url: await ctx.storage.getUrl(storageId),
      })),
    );
  },
});

/**
 * Dev-only stand-in for the parallel claim flow. Binds the calling
 * user's `tokenIdentifier` to a company by slug so the dashboard can be
 * exercised end-to-end before the real claim flow lands.
 *
 * Gated by the `ALLOW_SELF_CLAIM` env var on the Convex deployment —
 * set it to `'true'` in dev / preview, leave it unset in prod. Delete
 * once the real claim flow is in place.
 */
export const devClaimMine = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    if (process.env.ALLOW_SELF_CLAIM !== 'true') {
      throw new Error(
        'Self-claim is disabled on this deployment. Set ALLOW_SELF_CLAIM=true in Convex env vars (dev/preview only).',
      );
    }
    const tokenIdentifier = await callerTokenIdentifier(ctx);
    if (!tokenIdentifier) {
      throw new Error('Sign in before claiming.');
    }
    const row = await ctx.db
      .query('companies')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!row) {
      throw new Error(`No company with slug "${slug}".`);
    }
    if (row.claimedBy && row.claimedBy !== tokenIdentifier) {
      throw new Error('That company is already claimed by another user.');
    }
    await ctx.db.patch(row._id, { claimedBy: tokenIdentifier });
    return { _id: row._id, slug: row.slug };
  },
});
