# Resources List Redesign — Design

**Date:** 2026-05-08
**Branch:** feat/public-site-header-guide (or successor)
**Author:** Jadon (with Claude)

## Goal

Replace the desktop card grid on `/resources` with a denser, scannable, *category-grouped* layout that supports browse-to-discover behavior. Keep mobile cards as-is. Clean up the resource taxonomy so categorization is unambiguous, and update the submit + admin flows so new resources land with a real category.

## Why

Today every resource card looks the same: title + clamped description + two buttons. There's no visible category, no stage signal, no community tag — just a wall of identically-shaped cards. Users browsing to discover ("what kinds of help exist out there?") get no pattern-matching cues.

The data is also fuzzy: `topics[]` mixes stage labels, themes, categories, and even industry names. There's no canonical "what *kind* of resource is this" field, which is exactly the question the page should answer at a glance.

## Scope

**In scope**

- New desktop layout: collapsible category sections with two-line rows
- Mobile keeps existing card grid (no behavior change)
- Schema: add `category` field, rename `topics[]` → `tags[]`, refresh facet types
- Migration: backfill `category` for existing resources, clean `tags[]`
- Submit form: add required `Category` select, rename "topics" → "tags"
- Admin moderation: real review UI to set/override category + tags before approve
- Filter bar: category chips replace topic chips
- Quiz/AI guide matching weighted by `category`

**Out of scope**

- Search-result UI changes (the global command bar) — categories will appear in results metadata but result layout stays
- Map page changes (companies table, separate redesign)
- Deeper filter UX (tag autocomplete, multi-facet filters) — possible follow-up
- Detail page redesign (`/resources/[slug]`)

## Approach

### Layout: comfy grouped rows (selected during brainstorm)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ▼ Capital & Funding                                                8 │
├──────────────────────────────────────────────────────────────────────┤
│ ▢  Utah Innovation Fund                                            ↗ │
│    Pre-seed and seed capital for Utah-based deep-tech and life…      │
│    [Veterans] [Pre-seed]                                             │
├──────────────────────────────────────────────────────────────────────┤
│ ▢  Kickstart Seed Fund                                             ↗ │
│    Mountain-West-focused early-stage VC backing software founders…   │
│    [Seed]                                                            │
└──────────────────────────────────────────────────────────────────────┘
```

- One section per `category`, ordered by a stable display order
- Section header is collapsible (disclosure caret + name + count)
- Each row: small icon placeholder, title, 1-line description snippet, inline badges (community, stage, optional tag highlights), external-link icon at right
- Click row → navigate to `/resources/[slug]` (existing detail page)
- External-link icon → opens `r.url` in new tab (does not navigate within app)
- Mobile (`< md`): falls back to existing card grid; sections become headings with cards below

### Components (Intent UI / React Aria)

- **`DisclosureGroup` / `Disclosure`** (`@/components/ui/disclosure-group`) — collapsible category sections
- **`GridList` + `GridListItem`** (`@/components/ui/grid-list`) — the rows. React Aria handles keyboard nav, selection state, and screen-reader semantics for free
- **`Badge`** (`@/components/ui/badge`) — inline tag chips for community/stage/highlighted tags
- **`Tooltip`** wrapping the external-link icon button (per AGENTS.md icon-only-button rule)
- **`Select`** (`@/components/ui/select`) — Category picker on submit form + admin moderation
- **`TagField`** (`@/components/ui/tag-field`) — Tag editor on admin moderation
- **`Button`** (`@/components/ui/button`) — Filter chips at top (category chips replace topic chips)

All interactions use `onPress`, not `onClick`.

### Taxonomy

**New field on `resources`:**

```ts
export const resourceCategoryValidator = v.union(
  v.literal('capital-funding'),         // VCs, angels, grants, loans
  v.literal('programs-accelerators'),   // Cohort programs, incubators, residencies
  v.literal('workforce-talent'),        // Hiring, training, apprenticeships, job corps
  v.literal('legal-ip-operations'),     // Legal clinics, IP, compliance, ops
  v.literal('mentorship-advisory'),     // 1:1 advising, EIR, board help
  v.literal('community-events'),        // Meetups, chambers, conferences, networks
  v.literal('education-training'),      // Universities, courses, certifications
  v.literal('government-econdev'),      // State/county programs, EDC offices
);
```

Display labels and descriptions live in a single source of truth (`lib/resources/categories.ts`):

```ts
export const RESOURCE_CATEGORIES = [
  { key: 'capital-funding', label: 'Capital & Funding', tagline: 'VC, angels, grants, loans' },
  { key: 'programs-accelerators', label: 'Programs & Accelerators', tagline: 'Cohorts, incubators, residencies' },
  { key: 'workforce-talent', label: 'Workforce & Talent', tagline: 'Hiring, training, apprenticeships' },
  { key: 'legal-ip-operations', label: 'Legal, IP & Operations', tagline: 'Legal clinics, IP, compliance' },
  { key: 'mentorship-advisory', label: 'Mentorship & Advisory', tagline: 'EIRs, board help, 1:1 advising' },
  { key: 'community-events', label: 'Community & Events', tagline: 'Meetups, chambers, conferences' },
  { key: 'education-training', label: 'Education & Training', tagline: 'Universities, courses, certifications' },
  { key: 'government-econdev', label: 'Government & Econ Dev', tagline: 'State/county programs, EDC offices' },
] as const;
```

**Rename `topics[]` → `tags[]`:**

`tags[]` is now strictly a secondary descriptor field — free-form-ish, multi-value, used for:

- Search-text composition (full-text + embeddings)
- AI guide matching enrichment
- Optional secondary filters (future)
- Tags should NOT contain stage values (those go in `stageTags`) or category values (those go in `category`)

**Existing fields retained:**

- `stageTags[]` — Pre-seed, Seed, Series A+, Late stage. Curated as part of cleanup.
- `communities[]` — Veterans, Rural, Students, etc.
- `industries[]` — Industry sectors. Stays for filtering by industry.
- `locations[]` — Utah counties. Stays for geo filter.

### Schema changes

```ts
// convex/schema.ts
resources: defineTable({
  // ...existing fields...
  category: resourceCategoryValidator,        // NEW, required
  tags: v.array(v.string()),                  // RENAMED from topics
  // ...
})
  .index('by_slug', ['slug'])
  .index('by_status', ['status'])
  .index('by_category', ['category', 'status']) // NEW — powers list-by-category
  .index('by_sourceId', ['sourceId'])
  .searchIndex('search_resources', { ... });
```

`resourceFacets` table: facet type literal union expands —

```ts
// convex/resourceValidators.ts
export const facetTypeValidator = v.union(
  v.literal('community'),
  v.literal('industry'),
  v.literal('location'),
  v.literal('tag'),       // RENAMED from 'topic'
  v.literal('stage'),     // existing
  v.literal('category'),  // NEW
);
```

`resourceSubmissions` table:

```ts
suggestedCategory: v.optional(resourceCategoryValidator), // NEW
suggestedTags: v.array(v.string()),                       // RENAMED from suggestedTopics
// rest unchanged
```

### Backend query changes

- **New:** `api.resources.listByCategory({ category, limit, cursor })` — uses `by_category` index
- **Replace:** `listPublishedPage` becomes a per-category fetcher OR returns rows pre-bucketed by category. Decision: keep `listPublishedPage` as-is for "All" view (fallback / no-category-grouping mode), and add `listGroupedByCategory` that returns `Record<CategoryKey, ResourceRow[]>` for the new default view.
- **Update:** `facetValues` and `listByFacet` accept `'category'` and `'tag'` facet types.
- **Update:** `matchResources` weights `category` matches highest, then `stageTags`, then `tags[]`/`communities[]`.
- **Update:** `embeddingSourceText` and `buildSearchText` include category label + tags.

### Migration

One-shot internal mutation `internal.resourceMigration.assignCategoriesAndCleanTags`:

1. Read all resources
2. For each resource, derive `category` via a hand-edited rules table (`lib/resources/migration-rules.ts`) keyed on title/topic substrings — e.g. "Innovation Fund" → `capital-funding`, "Job Corps" → `workforce-talent`, "Chamber of Commerce" → `community-events`
3. Anything ambiguous defaults to `government-econdev` (the safest catch-all for state-program-heavy data) AND is logged for human review
4. Strip stage strings + duplicated category strings from `tags[]`
5. Update `resourceFacets`: rename `'topic'` rows to `'tag'`; insert new `'category'` rows
6. Re-build `searchText` and re-trigger embedding regeneration

All entries that fall through to the default catch-all are written to a `_migrationReviewLog` table (resource id + reason). A developer reviews the log and runs a one-shot Convex internal mutation (`internal.resourceMigration.setCategoryById`) per outlier — small enough volume that a dedicated admin UI isn't worth building. The migration is idempotent (re-running produces no changes for already-categorized resources).

### Submit form changes

- New required field: `Category` (Select — `@/components/ui/select`) populated from `RESOURCE_CATEGORIES`
- Rename "Suggested topics / tags" → "Suggested tags"
- Validation: category required; tags optional, max 10
- Send `suggestedCategory` + `suggestedTags` to `resourceSubmissions:submit`

### Admin moderation changes

Replace the bare title+URL list with a real review card per submission:

- Title, URL, submitter info, organization, notes (existing, surfaced)
- **Description** — show full submitted description (currently hidden!)
- **Category** — `Select` showing the submitter's suggested category, admin can override
- **Tags** — `TagField` showing the submitted tags, admin can edit/clean before approval
- **Stage tags** — `TagField`, admin sets if applicable
- **Communities** — `TagField`, admin sets if applicable
- Approve button → calls `approve({ submissionId, category, tags, stageTags, communities })` so admin's edits are what get persisted on the resource
- Reject button → unchanged (still requires note)

Approval mutation expands to accept the curated values and writes them onto the new resource row instead of just copying suggested values.

### Filter bar (top of `/resources`)

Today's topic chips become category chips:

```
[All resources] [Capital & Funding] [Programs & Accelerators] [Workforce & Talent] ...
```

- Chips driven by `RESOURCE_CATEGORIES` order (stable, no DB query needed)
- Active chip filters the list to a single category (collapses other sections, or hides them)
- "All resources" chip restores the multi-section grouped view
- Future: a secondary `TagField`-style filter could allow multi-tag narrowing — out of scope for this design

## Affected files

**Convex (backend)**
- `convex/schema.ts` — add `category`, rename `topics`→`tags`, add `by_category` index
- `convex/resourceValidators.ts` — `resourceCategoryValidator`, update `facetTypeValidator`
- `convex/resources.ts` — new `listGroupedByCategory`, update `facetValues`, `listByFacet`, search payloads
- `convex/resourceInternal.ts` — write `category` + cleaned `tags` on upsert; update facet writes
- `convex/resourceImport.ts` — accept `categoryRaw` (or derived); pass through to upsert
- `convex/resourceSubmissions.ts` — add `suggestedCategory`, rename `suggestedTopics`→`suggestedTags`; expand `approve` to accept admin overrides
- `convex/resourceMigration.ts` — NEW, one-shot internal mutation to backfill
- `convex/lib/resourceHelpers.ts` — `buildSearchText`, `embeddingSourceText` include category
- `convex/lib/matchResources.ts` — weight category in scoring
- `convex/lib/facetTypes.ts` — facet type constants

**Shared (lib)**
- `lib/resources/categories.ts` — NEW, `RESOURCE_CATEGORIES` source of truth + helpers
- `lib/resources/migration-rules.ts` — NEW, title/topic-substring → category rules
- `lib/forms/resource-submit.ts` — add `category` to Zod schema, rename `tags` field semantics

**UI (components / app)**
- `components/resources/resources-browse-client.tsx` — major rewrite: replace card grid with grouped `DisclosureGroup` + `GridList` rows; mobile fallback; category chips
- `components/resources/resource-row.tsx` — NEW, single comfy row component (extracted for reuse + testing)
- `components/resources/resource-card.tsx` — NEW (extracted from current inline card markup, used on mobile)
- `components/resources/resource-submit-form.tsx` — add `Category` Select, rename label
- `components/admin/admin-resources-client.tsx` — major rewrite of moderation queue with review cards
- `app/[locale]/resources/page.tsx` — likely no changes (server still loads facets)
- `app/[locale]/resources/[slug]/page.tsx` — show category badge above existing tags (small touch)

**Tests**
- `tests/resource-categorization.test.ts` — NEW, unit tests for `migration-rules` mapping (high-coverage on real CSV titles)
- `tests/resource-row.test.tsx` — NEW, component test for the row (renders title/desc/badges, click target)
- Existing tests touched: any that imported `topics` field on resource type

**Data / scripts**
- `scripts/seed-resources.ts` — set `category` per row (via `migration-rules`); rename `topicsRaw` → `tagsRaw`
- `Resources List - Builder Day - Sheet1.csv` — leave file alone (source-of-truth artifact); cleanup happens in code

## Data flow

```
CSV / submission → import/approve → migration-rules.assign(title, tags, ...) → category
                                                                              ↓
                                                                          resources row
                                                                              ↓
                                                              resourceFacets: category, tag, ...
                                                                              ↓
                                              listGroupedByCategory query (by_category index)
                                                                              ↓
                                                                  ResourceBrowseClient renders
                                                                  DisclosureGroup per category
                                                                  GridListItem per resource
```

## Error handling

- Migration: any resource that can't be confidently mapped → bucketed into `government-econdev` (catch-all) AND inserted into a `_migrationReviewLog` table for follow-up. The page still renders.
- Submit form: category required at form layer; server re-validates.
- Admin approve: if approval payload lacks category, server rejects with clear error (no silent fallback).
- Browse query: if `listGroupedByCategory` errors, fall back to flat list rendering (existing component pulled out as `<ResourcesFlatList>`).

## Testing

- **Unit:** `migration-rules` maps every existing CSV row to a non-default category in ≥80% of cases; remainder logged.
- **Unit:** `buildSearchText` includes category label.
- **Component:** `ResourceRow` renders title, snippet, badges, external-link icon (with tooltip), and triggers correct nav target.
- **Integration:** browse page renders all 8 sections + "All resources" chip switches modes correctly.
- **Manual:** open `/resources` in a browser at desktop and mobile widths; click into a few resources; submit a new resource; approve from admin with an overridden category.

## Open questions / risks

- **Renaming a Convex field** (`topics` → `tags`) requires a migration step. Convex doesn't support in-place rename — we add `tags`, copy from `topics`, drop `topics` after a deploy. Spec implementation should sequence this carefully (add → copy → switch reads → drop).
- **`facetType` literal change** (`'topic'` → `'tag'`) is a same kind of issue: existing rows with type `'topic'` need to be rewritten before validators reject them. Sequence: add `'tag'` to the union → migrate rows → drop `'topic'`.
- **Embedding regeneration** is async + costs OpenAI calls. Trigger it from the migration but don't block the page on it; existing embeddings are still useful for search.
- **Filter chip overflow** at narrow desktop widths (8 categories + "All" = 9 chips) — may need horizontal scroll or wrap. Decide during implementation.
