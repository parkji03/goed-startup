# Resources List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop card grid on `/resources` with collapsible category-grouped two-line rows, and clean up resource taxonomy (`category` + renamed `tags`) end-to-end across schema, migration, submit form, admin moderation, and quiz matching.

**Architecture:** Phased rollout. (1) Add curated `category` field + rename `topics`→`tags` *additively* — old code keeps working. (2) Backfill data via one-shot internal mutation with a hand-edited rules table. (3) Update queries, helpers, matching, submit + admin UI to use new fields. (4) Rewrite browse list (desktop: `DisclosureGroup` + `GridList`; mobile: existing cards). (5) Tighten schema — drop `topics`, make `category` required. Each phase produces shippable software.

**Tech Stack:** Next.js 16, Convex, React Aria Components / Intent UI, Tailwind v4, Zod, react-hook-form, Vitest.

**Reference spec:** `docs/superpowers/specs/2026-05-08-resources-list-redesign-design.md`

---

## File Map

**Created**
- `lib/resources/categories.ts` — `RESOURCE_CATEGORIES` source of truth + helpers
- `lib/resources/migration-rules.ts` — title-substring → category mapping
- `convex/resourceMigration.ts` — backfill + per-resource override mutations
- `components/resources/resource-row.tsx` — single comfy row component (desktop)
- `components/resources/resource-card.tsx` — card component (mobile + extracted from current inline markup)
- `tests/resource-categorization.test.ts` — unit tests for migration rules
- `tests/resource-row.test.tsx` — component test for the row

**Modified**
- `convex/schema.ts` — add `category`, `tags`, `by_category` index; `resourceSubmissions` adds `suggestedCategory`/`suggestedTags`
- `convex/resourceValidators.ts` — `resourceCategoryValidator`, expand `facetTypeValidator`
- `convex/lib/resourceHelpers.ts` — helpers handle category + tags
- `convex/lib/matchResources.ts` — weight category in scoring
- `convex/resourceInternal.ts` — upsert writes new fields
- `convex/resourceImport.ts` — accepts category from rules
- `convex/resources.ts` — `listGroupedByCategory`, expanded validators on `listByFacet` / `facetValues`
- `convex/resourceSubmissions.ts` — submit + approve accept new fields
- `lib/forms/resource-submit.ts` — Zod schema requires category
- `components/resources/resources-browse-client.tsx` — major rewrite (desktop grouped rows, mobile cards, category chips)
- `components/resources/resource-submit-form.tsx` — Category Select
- `components/admin/admin-resources-client.tsx` — review UI with category override
- `components/resources/resource-detail-client.tsx` — show category badge

---

## Task 1: Category source of truth + validator

**Files:**
- Create: `lib/resources/categories.ts`
- Modify: `convex/resourceValidators.ts`

- [ ] **Step 1: Create `lib/resources/categories.ts`**

```ts
// lib/resources/categories.ts
export const RESOURCE_CATEGORY_KEYS = [
  "capital-funding",
  "programs-accelerators",
  "workforce-talent",
  "legal-ip-operations",
  "mentorship-advisory",
  "community-events",
  "education-training",
  "government-econdev",
] as const;

export type ResourceCategoryKey = (typeof RESOURCE_CATEGORY_KEYS)[number];

export const RESOURCE_CATEGORIES: ReadonlyArray<{
  key: ResourceCategoryKey;
  label: string;
  tagline: string;
}> = [
  { key: "capital-funding", label: "Capital & Funding", tagline: "VC, angels, grants, loans" },
  { key: "programs-accelerators", label: "Programs & Accelerators", tagline: "Cohorts, incubators, residencies" },
  { key: "workforce-talent", label: "Workforce & Talent", tagline: "Hiring, training, apprenticeships" },
  { key: "legal-ip-operations", label: "Legal, IP & Operations", tagline: "Legal clinics, IP, compliance" },
  { key: "mentorship-advisory", label: "Mentorship & Advisory", tagline: "EIRs, board help, 1:1 advising" },
  { key: "community-events", label: "Community & Events", tagline: "Meetups, chambers, conferences" },
  { key: "education-training", label: "Education & Training", tagline: "Universities, courses, certifications" },
  { key: "government-econdev", label: "Government & Econ Dev", tagline: "State/county programs, EDC offices" },
];

const LABEL_BY_KEY: Record<ResourceCategoryKey, string> = Object.fromEntries(
  RESOURCE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<ResourceCategoryKey, string>;

export function categoryLabel(key: ResourceCategoryKey): string {
  return LABEL_BY_KEY[key];
}

export function isResourceCategoryKey(value: unknown): value is ResourceCategoryKey {
  return typeof value === "string" && (RESOURCE_CATEGORY_KEYS as readonly string[]).includes(value);
}
```

- [ ] **Step 2: Add `resourceCategoryValidator` in `convex/resourceValidators.ts`**

Add directly after `resourceStatusValidator`:

```ts
export const resourceCategoryValidator = v.union(
  v.literal('capital-funding'),
  v.literal('programs-accelerators'),
  v.literal('workforce-talent'),
  v.literal('legal-ip-operations'),
  v.literal('mentorship-advisory'),
  v.literal('community-events'),
  v.literal('education-training'),
  v.literal('government-econdev'),
);
```

Expand `facetTypeValidator` to include the two new literals (keep `'topic'` for now):

```ts
export const facetTypeValidator = v.union(
  v.literal('community'),
  v.literal('industry'),
  v.literal('location'),
  v.literal('topic'),
  v.literal('tag'),
  v.literal('stage'),
  v.literal('category'),
);
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add lib/resources/categories.ts convex/resourceValidators.ts
git commit -m "feat(resources): add ResourceCategory source of truth + validators"
```

---

## Task 2: Migration rules + unit test

**Files:**
- Create: `lib/resources/migration-rules.ts`
- Create: `tests/resource-categorization.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/resource-categorization.test.ts
import { describe, expect, it } from "vitest";
import { assignCategory } from "../lib/resources/migration-rules";

describe("assignCategory", () => {
  it("maps 'Innovation Fund' titles to capital-funding", () => {
    expect(assignCategory({ title: "Utah Innovation Fund", topics: [] })).toEqual({
      category: "capital-funding",
      confidence: "high",
    });
  });

  it("maps 'Job Corps' titles to workforce-talent", () => {
    expect(assignCategory({ title: "Clearfield Job Corps", topics: [] })).toEqual({
      category: "workforce-talent",
      confidence: "high",
    });
  });

  it("maps 'Chamber of Commerce' titles to community-events", () => {
    expect(assignCategory({ title: "Davis Chamber of Commerce", topics: [] })).toEqual({
      category: "community-events",
      confidence: "high",
    });
  });

  it("maps 'University' / 'College' titles to education-training", () => {
    expect(assignCategory({ title: "Utah State University Extension", topics: [] }).category).toBe(
      "education-training",
    );
  });

  it("uses topics signal when title is generic", () => {
    expect(
      assignCategory({ title: "Acme Resource", topics: ["Funding", "Mentorship"] }).category,
    ).toBe("capital-funding");
  });

  it("falls back to government-econdev with low confidence for unmatched", () => {
    expect(assignCategory({ title: "Unknown XYZ", topics: [] })).toEqual({
      category: "government-econdev",
      confidence: "low",
    });
  });

  it("strips stage values from topics in cleanTags", () => {
    const { cleanTags } = require("../lib/resources/migration-rules");
    expect(
      cleanTags(["Pre-seed", "Funding", "Late Stage Growth", "mentorship", "Pre-seed"]),
    ).toEqual(["Funding", "mentorship"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/resource-categorization.test.ts`
Expected: FAIL — `Cannot find module '../lib/resources/migration-rules'`.

- [ ] **Step 3: Implement `lib/resources/migration-rules.ts`**

```ts
// lib/resources/migration-rules.ts
import type { ResourceCategoryKey } from "./categories";

type Confidence = "high" | "medium" | "low";

type Rule = {
  match: RegExp;
  category: ResourceCategoryKey;
  confidence: Confidence;
};

const TITLE_RULES: Rule[] = [
  // capital-funding
  { match: /\b(innovation fund|venture|capital|angels?|grants?|seed fund|investors?)\b/i, category: "capital-funding", confidence: "high" },
  // programs-accelerators
  { match: /\b(accelerator|incubator|cohort|residency|founders|launch ?pad|boom ?startup|y ?combinator)\b/i, category: "programs-accelerators", confidence: "high" },
  // workforce-talent
  { match: /\b(job corps|workforce|apprentice|talent|hiring|workforce services|career center)\b/i, category: "workforce-talent", confidence: "high" },
  // legal-ip-operations
  { match: /\b(legal|attorney|lawyer|patent|trademark|ip clinic|compliance)\b/i, category: "legal-ip-operations", confidence: "high" },
  // mentorship-advisory
  { match: /\b(mentor|advisory|advisors?|score|coaching|EIR|executive in residence)\b/i, category: "mentorship-advisory", confidence: "high" },
  // community-events
  { match: /\b(chamber|meetup|conference|summit|alliance|association|network|community)\b/i, category: "community-events", confidence: "high" },
  // education-training
  { match: /\b(university|college|institute|extension|school|academy|certification|course|training)\b/i, category: "education-training", confidence: "high" },
  // government-econdev
  { match: /\b(department of|economic development|edc|state of utah|county|city of|government)\b/i, category: "government-econdev", confidence: "high" },
];

const TOPIC_RULES: Array<{ match: RegExp; category: ResourceCategoryKey }> = [
  { match: /\b(funding|capital|investment)\b/i, category: "capital-funding" },
  { match: /\b(accelerator|incubator|program)\b/i, category: "programs-accelerators" },
  { match: /\b(workforce|talent|hiring|employment)\b/i, category: "workforce-talent" },
  { match: /\b(legal|ip|patent)\b/i, category: "legal-ip-operations" },
  { match: /\b(mentor|advisory)\b/i, category: "mentorship-advisory" },
  { match: /\b(community|event|networking)\b/i, category: "community-events" },
  { match: /\b(education|training|course)\b/i, category: "education-training" },
];

export function assignCategory(input: { title: string; topics: string[] }): {
  category: ResourceCategoryKey;
  confidence: Confidence;
} {
  for (const rule of TITLE_RULES) {
    if (rule.match.test(input.title)) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }
  const topicHay = input.topics.join(" ");
  for (const rule of TOPIC_RULES) {
    if (rule.match.test(topicHay)) {
      return { category: rule.category, confidence: "medium" };
    }
  }
  return { category: "government-econdev", confidence: "low" };
}

const STAGE_FRAGMENTS = [
  "pre-seed", "pre seed", "seed", "series a", "series b", "series c",
  "growth", "late stage", "early stage", "idea stage",
];

export function cleanTags(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of topics) {
    const t = raw.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (STAGE_FRAGMENTS.some((s) => lower.includes(s))) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  return out;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm exec vitest run tests/resource-categorization.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/resources/migration-rules.ts tests/resource-categorization.test.ts
git commit -m "feat(resources): migration rules to assign category + clean tags"
```

---

## Task 3: Schema additive (new fields, parallel to topics)

**Files:**
- Modify: `convex/schema.ts`

- [ ] **Step 1: Add `category`, `tags`, and `by_category` index to the `resources` table**

In `defineSchema({ resources: defineTable({ ... }) })`, add the two new fields:

```ts
resources: defineTable({
  title: v.string(),
  slug: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  communities: v.array(v.string()),
  industries: v.array(v.string()),
  locations: v.array(v.string()),
  topics: v.array(v.string()),
  tags: v.optional(v.array(v.string())),                 // NEW (will become required after migration)
  category: v.optional(resourceCategoryValidator),       // NEW (will become required after migration)
  stageTags: v.array(v.string()),
  searchText: v.string(),
  status: resourceStatusValidator,
  submissionId: v.optional(v.id('resourceSubmissions')),
  lastSyncedAt: v.optional(v.number()),
  embeddingVersion: v.optional(v.number()),
})
  .index('by_slug', ['slug'])
  .index('by_status', ['status'])
  .index('by_sourceId', ['sourceId'])
  .index('by_category', ['category', 'status'])         // NEW
  .searchIndex('search_resources', {
    searchField: 'searchText',
    filterFields: ['status'],
    staged: false,
  }),
```

Also import `resourceCategoryValidator` at the top of the file:

```ts
import {
  facetTypeValidator,
  resourceCategoryValidator,
  resourceStatusValidator,
  submissionStatusValidator,
} from './resourceValidators';
```

- [ ] **Step 2: Add `suggestedCategory` and `suggestedTags` to `resourceSubmissions`**

In the same file, in the `resourceSubmissions` table:

```ts
resourceSubmissions: defineTable({
  title: v.string(),
  description: v.string(),
  url: v.string(),
  submitterName: v.string(),
  submitterEmail: v.string(),
  organization: v.optional(v.string()),
  suggestedCommunities: v.array(v.string()),
  suggestedIndustries: v.array(v.string()),
  suggestedLocations: v.array(v.string()),
  suggestedTopics: v.array(v.string()),
  suggestedTags: v.optional(v.array(v.string())),       // NEW
  suggestedCategory: v.optional(resourceCategoryValidator),  // NEW
  notes: v.optional(v.string()),
  status: submissionStatusValidator,
  moderatorNote: v.optional(v.string()),
  mergedIntoResourceId: v.optional(v.id('resources')),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_status', ['status'])
  .index('by_submitterEmail', ['submitterEmail']),
```

- [ ] **Step 3: Update the submission validator in `convex/resourceValidators.ts`**

Append the two optional fields to `resourceSubmissionDocValidator`:

```ts
export const resourceSubmissionDocValidator = v.object({
  _id: v.id('resourceSubmissions'),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  url: v.string(),
  submitterName: v.string(),
  submitterEmail: v.string(),
  organization: v.optional(v.string()),
  suggestedCommunities: v.array(v.string()),
  suggestedIndustries: v.array(v.string()),
  suggestedLocations: v.array(v.string()),
  suggestedTopics: v.array(v.string()),
  suggestedTags: v.optional(v.array(v.string())),       // NEW
  suggestedCategory: v.optional(resourceCategoryValidator),  // NEW
  notes: v.optional(v.string()),
  status: submissionStatusValidator,
  moderatorNote: v.optional(v.string()),
  mergedIntoResourceId: v.optional(v.id('resources')),
  createdAt: v.number(),
  updatedAt: v.number(),
});
```

- [ ] **Step 4: Push schema, verify Convex accepts**

Run: `pnpm exec convex dev --once`
Expected: schema deploys cleanly. No "schema validation failed" errors (existing rows have undefined `category`/`tags`, which is fine because they're optional).

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/resourceValidators.ts
git commit -m "feat(resources): add optional category + tags fields and by_category index"
```

---

## Task 4: Update helpers — searchText + embedding + facets handle new fields

**Files:**
- Modify: `convex/lib/resourceHelpers.ts`

- [ ] **Step 1: Update `buildSearchText` to take `category` and `tags`**

Replace the current `buildSearchText` implementation:

```ts
import type { ResourceCategoryKey } from '../../lib/resources/categories';
import { categoryLabel } from '../../lib/resources/categories';

export function buildSearchText(parts: {
  title: string;
  description: string;
  url: string;
  contactEmail?: string;
  category?: ResourceCategoryKey;
  communities: string[];
  industries: string[];
  locations: string[];
  tags: string[];
  topics: string[];        // kept for backwards compat during migration window
  stageTags: string[];
}): string {
  const chunks = [
    parts.title,
    parts.description,
    parts.url,
    parts.contactEmail,
    parts.category ? categoryLabel(parts.category) : undefined,
    ...parts.communities,
    ...parts.industries,
    ...parts.locations,
    ...parts.tags,
    ...parts.topics,
    ...parts.stageTags,
  ];
  return chunks.filter(Boolean).join(' | ');
}
```

- [ ] **Step 2: Update `embeddingSourceText` to include category + tags**

Replace `embeddingSourceText`:

```ts
export function embeddingSourceText(parts: {
  title: string;
  description: string;
  category?: ResourceCategoryKey;
  tags: string[];
  topics: string[];
  industries: string[];
  communities: string[];
  locations: string[];
}): string {
  return [
    `Title: ${parts.title}`,
    `Description: ${parts.description}`,
    parts.category ? `Category: ${categoryLabel(parts.category)}` : "",
    `Tags: ${[...parts.tags, ...parts.topics].join('; ')}`,
    `Industries: ${parts.industries.join('; ')}`,
    `Communities: ${parts.communities.join('; ')}`,
    `Locations: ${parts.locations.join('; ')}`,
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 3: Update `facetsFromResourceFields` to emit `tag` + `category` rows**

Replace:

```ts
export function facetsFromResourceFields(args: {
  category?: ResourceCategoryKey;
  communities: string[];
  industries: string[];
  locations: string[];
  tags: string[];
  topics: string[];        // dropped after migration; emitted during window for query compat
  stageTags: string[];
}): FacetRowInput[] {
  const out: FacetRowInput[] = [];
  if (args.category) out.push({ facetType: 'category', value: args.category });
  for (const value of args.communities) out.push({ facetType: 'community', value });
  for (const value of args.industries) out.push({ facetType: 'industry', value });
  for (const value of args.locations) out.push({ facetType: 'location', value });
  for (const value of args.tags) out.push({ facetType: 'tag', value });
  for (const value of args.topics) out.push({ facetType: 'topic', value });
  for (const value of args.stageTags) out.push({ facetType: 'stage', value });
  return out;
}
```

- [ ] **Step 4: Update callers of `buildSearchText` / `embeddingSourceText` / `facetsFromResourceFields` to pass new args (TS will fail until done)**

Type-check:
Run: `pnpm exec tsc --noEmit`
Expected: errors in `convex/resourceInternal.ts`, `convex/resourceEmbeddings.ts`, `convex/resourceEmbeddingsNode.ts` (anywhere these helpers are called). Note them — Task 5 fixes them.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/resourceHelpers.ts
git commit -m "feat(resources): helpers accept category + tags alongside topics"
```

---

## Task 5: Update upsert + import to write new fields

**Files:**
- Modify: `convex/resourceInternal.ts`
- Modify: `convex/resourceImport.ts`
- Modify: `convex/resourceEmbeddings.ts` (and `convex/resourceEmbeddingsNode.ts` if it calls `embeddingSourceText`)

- [ ] **Step 1: Expand `upsertRowValidator` and `upsertResource` in `convex/resourceInternal.ts`**

In the validator:

```ts
const upsertRowValidator = v.object({
  sourceId: v.string(),
  title: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  communitiesRaw: v.optional(v.string()),
  industriesRaw: v.optional(v.string()),
  locationsRaw: v.optional(v.string()),
  topicsRaw: v.optional(v.string()),
  tagsRaw: v.optional(v.string()),                       // NEW (pipe-list)
  category: v.optional(resourceCategoryValidator),       // NEW
  status: resourceStatusValidator,
  submissionId: v.optional(v.id('resourceSubmissions')),
});
```

Add the import at the top:

```ts
import { resourceCategoryValidator, resourceStatusValidator } from './resourceValidators';
```

In the handler, after `topics = splitPipeList(...)`, derive `tags` and pass everything through:

```ts
const contactEmail = sanitizeContactEmail(row.contactEmail);
const communities = splitPipeList(row.communitiesRaw);
const industries = splitPipeList(row.industriesRaw);
const locations = splitPipeList(row.locationsRaw);
const topics = splitPipeList(row.topicsRaw);
const tags = splitPipeList(row.tagsRaw);
const stageTags = inferStageTagsFromTopics([...topics, ...tags]);
const category = row.category;
const searchText = buildSearchText({
  title: row.title,
  description: row.description,
  url: row.url,
  contactEmail,
  category,
  communities,
  industries,
  locations,
  tags,
  topics,
  stageTags,
});
```

Then in both the `patch` and `insert` calls, add the two new fields next to `topics`:

```ts
await ctx.db.patch(resourceId, {
  title: row.title,
  slug,
  description: row.description,
  url: row.url,
  contactEmail,
  sourceId: row.sourceId,
  communities,
  industries,
  locations,
  topics,
  tags,
  category,
  stageTags,
  searchText,
  status: row.status,
  submissionId: row.submissionId,
  lastSyncedAt: Date.now(),
});
// (same for the insert branch)
```

Update the `facetsFromResourceFields` call to include category + tags:

```ts
const facetRows = facetsFromResourceFields({
  category,
  communities,
  industries,
  locations,
  tags,
  topics,
  stageTags,
});
```

Update `replaceFacets` validator too — change the union literal to `facetTypeValidator`:

```ts
import { facetTypeValidator, resourceStatusValidator } from './resourceValidators';

export const replaceFacets = internalMutation({
  args: {
    resourceId: v.id('resources'),
    status: resourceStatusValidator,
    facetRows: v.array(
      v.object({
        facetType: facetTypeValidator,
        value: v.string(),
      }),
    ),
  },
  // handler unchanged
});
```

- [ ] **Step 2: Update `convex/resourceImport.ts` to thread category through**

Add to `importRow` validator:

```ts
const importRow = v.object({
  // existing fields...
  tagsRaw: v.optional(v.string()),                       // NEW
  category: v.optional(resourceCategoryValidator),       // NEW
});
```

Import:

```ts
import { resourceCategoryValidator, resourceStatusValidator } from './resourceValidators';
```

The `importInternal` mutation already passes `r` straight through — no handler change needed if `importRow` and `upsertRowValidator` already permit `tagsRaw` / `category`. Verify by type-checking.

- [ ] **Step 3: Fix `embeddingSourceText` callers**

Read `convex/resourceEmbeddings.ts` and `convex/resourceEmbeddingsNode.ts`. Update the call sites of `embeddingSourceText` to pass the new shape:

```ts
const text = embeddingSourceText({
  title: doc.title,
  description: doc.description,
  category: doc.category,
  tags: doc.tags ?? [],
  topics: doc.topics,
  industries: doc.industries,
  communities: doc.communities,
  locations: doc.locations,
});
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add convex/resourceInternal.ts convex/resourceImport.ts convex/resourceEmbeddings.ts convex/resourceEmbeddingsNode.ts
git commit -m "feat(resources): upsert + import + embeddings handle category and tags"
```

---

## Task 6: Backfill mutation

**Files:**
- Create: `convex/resourceMigration.ts`

- [ ] **Step 1: Create the backfill internal mutation**

```ts
// convex/resourceMigration.ts
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { assignCategory, cleanTags } from '../lib/resources/migration-rules';
import {
  buildSearchText,
  facetsFromResourceFields,
  inferStageTagsFromTopics,
} from './lib/resourceHelpers';
import { resourceCategoryValidator } from './resourceValidators';

export const backfillCategoriesAndTags = internalMutation({
  args: {
    /** When true, skip resources that already have a category. Default: true. */
    skipAlreadyCategorized: v.optional(v.boolean()),
  },
  handler: async (ctx, { skipAlreadyCategorized = true }) => {
    const resources = await ctx.db.query('resources').take(5000);
    let updated = 0;
    let lowConfidence = 0;
    for (const r of resources) {
      if (skipAlreadyCategorized && r.category) continue;

      const { category, confidence } = assignCategory({
        title: r.title,
        topics: r.topics,
      });
      const tags = cleanTags(r.topics);
      const stageTags = inferStageTagsFromTopics(r.topics);

      const searchText = buildSearchText({
        title: r.title,
        description: r.description,
        url: r.url,
        contactEmail: r.contactEmail,
        category,
        communities: r.communities,
        industries: r.industries,
        locations: r.locations,
        tags,
        topics: r.topics,
        stageTags,
      });

      await ctx.db.patch(r._id, {
        category,
        tags,
        stageTags,
        searchText,
        lastSyncedAt: Date.now(),
      });

      const facetRows = facetsFromResourceFields({
        category,
        communities: r.communities,
        industries: r.industries,
        locations: r.locations,
        tags,
        topics: r.topics,
        stageTags,
      });
      await ctx.runMutation(internal.resourceInternal.replaceFacets, {
        resourceId: r._id,
        status: r.status,
        facetRows,
      });

      // Re-run embedding so the new category text is in the vector
      await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, {
        resourceId: r._id,
      });

      updated += 1;
      if (confidence === 'low') lowConfidence += 1;
    }
    return { updated, lowConfidence, scanned: resources.length };
  },
});

export const setCategoryById = internalMutation({
  args: {
    resourceId: v.id('resources'),
    category: resourceCategoryValidator,
  },
  handler: async (ctx, { resourceId, category }) => {
    const r = await ctx.db.get(resourceId);
    if (!r) throw new Error('Resource not found');
    const tags = r.tags ?? cleanTags(r.topics);
    const searchText = buildSearchText({
      title: r.title,
      description: r.description,
      url: r.url,
      contactEmail: r.contactEmail,
      category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags,
      topics: r.topics,
      stageTags: r.stageTags,
    });
    await ctx.db.patch(resourceId, { category, tags, searchText, lastSyncedAt: Date.now() });
    const facetRows = facetsFromResourceFields({
      category,
      communities: r.communities,
      industries: r.industries,
      locations: r.locations,
      tags,
      topics: r.topics,
      stageTags: r.stageTags,
    });
    await ctx.runMutation(internal.resourceInternal.replaceFacets, {
      resourceId,
      status: r.status,
      facetRows,
    });
    await ctx.scheduler.runAfter(0, internal.resourceEmbeddingsNode.embedResource, { resourceId });
  },
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add convex/resourceMigration.ts
git commit -m "feat(resources): backfill mutation to assign category + clean tags"
```

---

## Task 7: Run the migration + verify

**Files:** none (operational checkpoint)

- [ ] **Step 1: Push current Convex code**

Run: `pnpm exec convex dev --once`
Expected: deploy succeeds.

- [ ] **Step 2: Run the backfill**

Run: `pnpm exec convex run resourceMigration:backfillCategoriesAndTags '{}'`
Expected: prints `{ updated: <count>, lowConfidence: <count>, scanned: <count> }`. Note the `lowConfidence` number — those need manual review.

- [ ] **Step 3: Spot-check the data**

Open the Convex dashboard → `resources` table. Confirm:
- A handful of rows have `category` set
- `tags` is populated and excludes stage strings
- `topics` is unchanged

- [ ] **Step 4: Spot-check the page (still rendering off `topics`)**

Run: `pnpm dev`
Open: `http://localhost:3000/resources`
Expected: page renders unchanged (UI hasn't been touched yet — just data has new fields).

- [ ] **Step 5: Commit nothing, but record the migration run**

No code commit. Move on.

---

## Task 8: Update queries — `listGroupedByCategory`, expand validators

**Files:**
- Modify: `convex/resources.ts`

- [ ] **Step 1: Replace the inline `facetType` unions with the shared validator**

Add to imports at top of `convex/resources.ts`:

```ts
import { facetTypeValidator } from './resourceValidators';
```

Replace the inline `v.union(...)` in `listByFacet.args.facetType` and `facetValues.args.facetType` with `facetTypeValidator`:

```ts
export const listByFacet = query({
  args: {
    facetType: facetTypeValidator,
    value: v.string(),
    limit: v.number(),
  },
  // handler unchanged for now (still returns the same projection)
});

export const facetValues = query({
  args: {
    facetType: facetTypeValidator,
    limit: v.number(),
  },
  // handler unchanged
});
```

- [ ] **Step 2: Add `listGroupedByCategory` query**

Append to `convex/resources.ts`:

```ts
import { RESOURCE_CATEGORY_KEYS, type ResourceCategoryKey } from '../lib/resources/categories';

export const listGroupedByCategory = query({
  args: { limitPerCategory: v.optional(v.number()) },
  handler: async (ctx, { limitPerCategory }) => {
    const lim = Math.min(Math.max(limitPerCategory ?? 50, 1), 200);
    const results: Record<ResourceCategoryKey, Array<{
      _id: unknown;
      title: string;
      slug: string;
      description: string;
      url: string;
      tags: string[];
      stageTags: string[];
      communities: string[];
    }>> = Object.fromEntries(
      RESOURCE_CATEGORY_KEYS.map((k) => [k, []]),
    ) as Record<ResourceCategoryKey, never[]>;

    for (const key of RESOURCE_CATEGORY_KEYS) {
      const rows = await ctx.db
        .query('resources')
        .withIndex('by_category', (q) => q.eq('category', key).eq('status', 'published'))
        .take(lim);
      results[key] = rows.map((r) => ({
        _id: r._id,
        title: r.title,
        slug: r.slug,
        description: r.description,
        url: r.url,
        tags: r.tags ?? [],
        stageTags: r.stageTags,
        communities: r.communities,
      }));
    }
    return results;
  },
});
```

- [ ] **Step 3: Update `listByFacet` and `listPublishedPage` projections to include `tags`, `stageTags`, `communities`, `category`**

For `listByFacet`, change the projection inside the `out` array to:

```ts
out.push({
  _id: r._id,
  title: r.title,
  slug: r.slug,
  description: r.description,
  url: r.url,
  category: r.category,
  tags: r.tags ?? [],
  stageTags: r.stageTags,
  communities: r.communities,
});
```

(And update the `out` type accordingly.)

Same projection update for `listPublishedPage.handler`'s `page.page.map(...)`.

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: errors in `components/resources/resources-browse-client.tsx` and `components/resources/resource-detail-client.tsx` because their consumed shape changed. Will fix in Task 13.

- [ ] **Step 5: Commit**

```bash
git add convex/resources.ts
git commit -m "feat(resources): listGroupedByCategory query + projections expose tags/stage/community"
```

---

## Task 9: Update matching engine to weight category

**Files:**
- Modify: `convex/lib/matchResources.ts`

- [ ] **Step 1: Update `ResourceTags` type and add category weight**

Replace the file body:

```ts
import type { Doc } from '../_generated/dataModel';
import type { FounderProfileConvex } from '../founderProfile';

type ResourceTags = Pick<
  Doc<'resources'>,
  'communities' | 'industries' | 'locations' | 'topics' | 'tags' | 'stageTags' | 'category'
>;

const WEIGHTS = {
  category: 6,
  goal: 5,
  industry: 4,
  county: 4,
  audience: 4,
  special: 5,
  stage: 3,
} as const;

function has(tags: string[], value: string) {
  return tags.some((t) => t.toLowerCase() === value.toLowerCase());
}

export function scoreResourceForProfile(
  resource: ResourceTags,
  profile: FounderProfileConvex,
): number {
  let score = 0;
  const goalText = profile.goals.join(' ').toLowerCase();
  if (resource.category && goalText.includes(resource.category.replace(/-/g, ' '))) {
    score += WEIGHTS.category;
  }
  const tagPool = [...(resource.tags ?? []), ...resource.topics];
  for (const g of profile.goals) {
    if (
      tagPool.some(
        (t) => t.toLowerCase().includes(g.toLowerCase()) || g.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      score += WEIGHTS.goal;
    }
  }
  for (const i of profile.industries) {
    if (
      resource.industries.some(
        (t) => t.toLowerCase().includes(i.toLowerCase()) || i.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      score += WEIGHTS.industry;
    }
  }
  for (const c of profile.counties) {
    if (
      resource.locations.some(
        (t) => t.toLowerCase().includes(c.toLowerCase()) || c.toLowerCase().includes(t.toLowerCase()),
      )
    ) {
      score += WEIGHTS.county;
    }
  }
  for (const a of profile.audiences) {
    if (has(resource.communities, a) || resource.communities.some((t) => t.includes(a))) {
      score += WEIGHTS.audience;
    }
  }
  for (const s of profile.specialStatuses) {
    if (has(resource.communities, s) || resource.communities.some((t) => t.includes(s))) {
      score += WEIGHTS.special;
    }
  }
  for (const st of profile.stages) {
    if (has(resource.stageTags, st) || tagPool.some((t) => t.toLowerCase().includes(st.toLowerCase()))) {
      score += WEIGHTS.stage;
    }
  }
  if (profile.freeText?.trim()) {
    const q = profile.freeText.toLowerCase();
    const hay = [
      ...tagPool,
      ...resource.industries,
      ...resource.communities,
      ...resource.locations,
    ]
      .join(' ')
      .toLowerCase();
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    for (const w of words) {
      if (hay.includes(w)) score += 1;
    }
  }
  return score;
}
```

- [ ] **Step 2: Run the existing personas test (regression)**

Run: `pnpm test:personas`
Expected: PASS. If a persona's expected ranking changed, investigate — it should still surface the same resources.

- [ ] **Step 3: Commit**

```bash
git add convex/lib/matchResources.ts
git commit -m "feat(resources): weight category in personalization scoring"
```

---

## Task 10: Submit form — Category Select

**Files:**
- Modify: `lib/forms/resource-submit.ts`
- Modify: `components/resources/resource-submit-form.tsx`
- Modify: `convex/resourceSubmissions.ts`

- [ ] **Step 1: Add `category` to the Zod schema**

Replace `lib/forms/resource-submit.ts`:

```ts
import { z } from "zod";
import { RESOURCE_CATEGORY_KEYS } from "@/lib/resources/categories";

function normalizeHttpsUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

export const resourceSubmitSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required"),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .transform(normalizeHttpsUrl)
    .refine(
      (s) => {
        try { new URL(s); return true; } catch { return false; }
      },
      { message: "Enter a valid URL" },
    ),
  submitterName: z.string().trim().min(1, "Name is required"),
  submitterEmail: z.string().trim().min(1, "Email is required").pipe(z.email()),
  organization: z.string().trim().optional(),
  category: z.enum(RESOURCE_CATEGORY_KEYS, { message: "Pick a category" }),
  tags: z.string().optional(),
  notes: z.string().trim().optional(),
});

export type ResourceSubmitValues = z.infer<typeof resourceSubmitSchema>;

export function splitSuggestedTags(tags: string | undefined): string[] {
  if (!tags?.trim()) return [];
  return tags.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
}
```

- [ ] **Step 2: Add Category Select to the form**

In `components/resources/resource-submit-form.tsx`, change the import:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { RESOURCE_CATEGORIES } from "@/lib/resources/categories";
import { resourceSubmitSchema, splitSuggestedTags, type ResourceSubmitValues } from "@/lib/forms/resource-submit";
```

Update `defaultValues`:

```tsx
defaultValues: {
  title: "",
  description: "",
  url: "",
  submitterName: "",
  submitterEmail: "",
  organization: "",
  category: undefined as unknown as ResourceSubmitValues["category"],
  tags: "",
  notes: "",
},
```

Replace `onSubmit` payload:

```tsx
await submit({
  title: values.title,
  description: values.description,
  url: values.url,
  submitterName: values.submitterName,
  submitterEmail: values.submitterEmail,
  organization: values.organization?.trim() || undefined,
  notes: values.notes?.trim() || undefined,
  suggestedCategory: values.category,
  suggestedCommunities: [],
  suggestedIndustries: [],
  suggestedLocations: [],
  suggestedTopics: [],            // legacy, leave empty
  suggestedTags: splitSuggestedTags(values.tags),
});
```

Add the Category field above the existing "tags" field:

```tsx
<div>
  <label htmlFor="category" className="font-medium text-fg text-sm">
    Category *
  </label>
  <Controller
    name="category"
    control={control}
    render={({ field }) => (
      <Select
        className="mt-1"
        placeholder="Pick a category"
        selectedKey={field.value ?? null}
        onSelectionChange={(key) => field.onChange(key)}
      >
        <SelectTrigger />
        <SelectContent items={RESOURCE_CATEGORIES}>
          {(c) => <SelectItem id={c.key} textValue={c.label}>{c.label}</SelectItem>}
        </SelectContent>
      </Select>
    )}
  />
  {errors.category?.message ? (
    <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.category.message}</Text>
  ) : null}
</div>
```

Update the existing tags field label to **"Suggested tags"** and placeholder to `"AI, women-led, climate (comma-separated)"`.

- [ ] **Step 3: Update `convex/resourceSubmissions.ts:submit` to accept the new args**

```ts
import {
  adminAccessDeniedReasonValidator,
  resourceCategoryValidator,
  resourceSubmissionDocValidator,
} from './resourceValidators';

export const submit = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    url: v.string(),
    submitterName: v.string(),
    submitterEmail: v.string(),
    organization: v.optional(v.string()),
    suggestedCategory: v.optional(resourceCategoryValidator),
    suggestedCommunities: v.array(v.string()),
    suggestedIndustries: v.array(v.string()),
    suggestedLocations: v.array(v.string()),
    suggestedTopics: v.array(v.string()),
    suggestedTags: v.optional(v.array(v.string())),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const id = await ctx.db.insert('resourceSubmissions', {
      title: args.title.trim(),
      description: args.description.trim(),
      url: args.url.trim(),
      submitterName: args.submitterName.trim(),
      submitterEmail: args.submitterEmail.trim().toLowerCase(),
      organization: args.organization?.trim(),
      suggestedCategory: args.suggestedCategory,
      suggestedCommunities: args.suggestedCommunities,
      suggestedIndustries: args.suggestedIndustries,
      suggestedLocations: args.suggestedLocations,
      suggestedTopics: args.suggestedTopics,
      suggestedTags: args.suggestedTags ?? [],
      notes: args.notes?.trim(),
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId: id,
      action: 'created',
      detail: 'public_submit',
      createdAt: now,
    });
    return { submissionId: id };
  },
});
```

- [ ] **Step 4: Verify in browser**

Run: `pnpm dev` → open `/resources` → click "Submit" → fill form including Category select → submit.
Expected: success toast, submission visible in admin queue (existing UI for now).

- [ ] **Step 5: Commit**

```bash
git add lib/forms/resource-submit.ts components/resources/resource-submit-form.tsx convex/resourceSubmissions.ts
git commit -m "feat(resources): submit form requires category, separates tags from topics"
```

---

## Task 11: Admin moderation rewrite

**Files:**
- Modify: `convex/resourceSubmissions.ts`
- Modify: `components/admin/admin-resources-client.tsx`

- [ ] **Step 1: Expand the `approve` mutation to accept category + cleaned tags + curation overrides**

In `convex/resourceSubmissions.ts`, replace the `approve` mutation:

```ts
export const approve = mutation({
  args: {
    submissionId: v.id('resourceSubmissions'),
    category: resourceCategoryValidator,
    tags: v.array(v.string()),
    communities: v.array(v.string()),
    stageTags: v.array(v.string()),
  },
  handler: async (ctx, { submissionId, category, tags, communities, stageTags }) => {
    const admin = await requireAdmin(ctx);
    const sub = await ctx.db.get(submissionId);
    if (!sub) throw new Error('Submission not found');
    if (sub.status !== 'pending' && sub.status !== 'needs_changes') {
      throw new Error('Submission is not approvable');
    }

    const sourceId = `submission-${submissionId}`;

    await ctx.runMutation(internal.resourceInternal.upsertResource, {
      row: {
        sourceId,
        title: sub.title,
        description: sub.description,
        url: sub.url,
        contactEmail: sub.submitterEmail,
        communitiesRaw: communities.join('|'),
        industriesRaw: sub.suggestedIndustries.join('|'),
        locationsRaw: sub.suggestedLocations.join('|'),
        topicsRaw: '',                                  // no longer used by submissions
        tagsRaw: tags.join('|'),
        category,
        status: 'published',
        submissionId,
      },
    });

    // stageTags is currently inferred from topics in upsert; admin-set values override:
    const newResource = await ctx.db
      .query('resources')
      .withIndex('by_sourceId', (q) => q.eq('sourceId', sourceId))
      .unique();
    if (newResource && stageTags.length > 0) {
      await ctx.db.patch(newResource._id, { stageTags });
    }

    const now = Date.now();
    await ctx.db.patch(submissionId, {
      status: 'approved',
      updatedAt: now,
    });
    await ctx.db.insert('resourceSubmissionEvents', {
      submissionId,
      actorTokenIdentifier: admin.tokenIdentifier,
      action: 'approved',
      createdAt: now,
    });
  },
});
```

- [ ] **Step 2: Replace the admin moderation UI**

In `components/admin/admin-resources-client.tsx`, after the existing imports, add:

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TagField } from "@/components/ui/tag-field";
import { RESOURCE_CATEGORIES, type ResourceCategoryKey } from "@/lib/resources/categories";
```

Note: `TagField` exposes `defaultValue: string[]` and `onChange: (selection: Selection) => void` (a React-Aria `Selection`, i.e. `"all" | Set<Key>`). To convert back to `string[]`, do `Array.from(selection as Set<unknown>).map(String)`. A small helper makes this clean:

```tsx
import type { Selection } from "react-aria-components";
function selectionToStrings(s: Selection): string[] {
  return s === "all" ? [] : Array.from(s).map((k) => String(k));
}
```

Add per-submission state alongside `rejectNoteBySubmission`:

```tsx
const [overridesBySubmission, setOverridesBySubmission] = useState<
  Record<string, {
    category: ResourceCategoryKey | null;
    tags: string[];
    communities: string[];
    stageTags: string[];
  }>
>({});

function ensureOverride(submissionId: string, defaults: {
  category: ResourceCategoryKey | null;
  tags: string[];
  communities: string[];
  stageTags: string[];
}) {
  setOverridesBySubmission((prev) => prev[submissionId] ? prev : { ...prev, [submissionId]: defaults });
}
```

Replace the `<li>` body in the pending list with the review card. Replace the `pendingList.map((s) => (...))` block:

```tsx
{pendingList.map((s) => {
  const o = overridesBySubmission[s._id] ?? {
    category: s.suggestedCategory ?? null,
    tags: s.suggestedTags ?? [],
    communities: s.suggestedCommunities,
    stageTags: [],
  };
  const setO = (patch: Partial<typeof o>) =>
    setOverridesBySubmission((prev) => ({ ...prev, [s._id]: { ...o, ...patch } }));

  return (
    <li key={s._id} className="rounded-xl border border-border p-4 space-y-4">
      <div>
        <Heading level={3} className="text-lg">{s.title}</Heading>
        <Text className="text-muted-fg text-sm">{s.url}</Text>
        <Text className="mt-2 text-sm">{s.description}</Text>
        <Text className="text-muted-fg mt-1 text-xs">
          Submitted by {s.submitterName} ({s.submitterEmail}){s.organization ? ` · ${s.organization}` : ""}
        </Text>
        {s.notes ? <Text className="mt-1 text-xs italic">Notes: {s.notes}</Text> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="font-medium text-fg text-sm">Category *</label>
          <Select
            className="mt-1"
            placeholder="Pick a category"
            selectedKey={o.category}
            onSelectionChange={(k) => setO({ category: k as ResourceCategoryKey })}
          >
            <SelectTrigger />
            <SelectContent items={RESOURCE_CATEGORIES}>
              {(c) => <SelectItem id={c.key} textValue={c.label}>{c.label}</SelectItem>}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="font-medium text-fg text-sm">Tags</label>
          <TagField
            className="mt-1"
            defaultValue={o.tags}
            onChange={(sel) => setO({ tags: selectionToStrings(sel) })}
          />
        </div>
        <div>
          <label className="font-medium text-fg text-sm">Communities</label>
          <TagField
            className="mt-1"
            defaultValue={o.communities}
            onChange={(sel) => setO({ communities: selectionToStrings(sel) })}
          />
        </div>
        <div>
          <label className="font-medium text-fg text-sm">Stage tags</label>
          <TagField
            className="mt-1"
            defaultValue={o.stageTags}
            onChange={(sel) => setO({ stageTags: selectionToStrings(sel) })}
          />
        </div>
      </div>

      <div>
        <label className="block font-medium text-fg text-sm" htmlFor={`reject-note-${s._id}`}>
          Rejection note
        </label>
        <textarea
          id={`reject-note-${s._id}`}
          placeholder="Brief reason…"
          className="border-input mt-1 min-h-20 w-full max-w-xl rounded-lg border bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
          value={rejectNoteBySubmission[s._id] ?? ""}
          onChange={(e) =>
            setRejectNoteBySubmission((prev) => ({ ...prev, [s._id]: e.target.value }))
          }
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          intent="primary"
          isDisabled={busyId !== null || !o.category}
          onPress={() =>
            void (async () => {
              if (!o.category) return;
              setBusyId(s._id);
              setLog("");
              try {
                await approve({
                  submissionId: s._id,
                  category: o.category,
                  tags: o.tags,
                  communities: o.communities,
                  stageTags: o.stageTags,
                });
              } catch (err) {
                setLog(err instanceof Error ? err.message : String(err));
              } finally {
                setBusyId(null);
              }
            })()
          }
        >
          Approve
        </Button>
        <Button
          size="sm"
          intent="danger"
          isDisabled={busyId !== null}
          onPress={() =>
            void (async () => {
              const reason = rejectNoteBySubmission[s._id]?.trim() ?? "";
              if (!reason) {
                setLog("Add a rejection note before rejecting.");
                return;
              }
              setBusyId(s._id);
              setLog("");
              try {
                await reject({ submissionId: s._id, reason });
                setRejectNoteBySubmission((prev) => {
                  const next = { ...prev }; delete next[s._id]; return next;
                });
              } catch (err) {
                setLog(err instanceof Error ? err.message : String(err));
              } finally {
                setBusyId(null);
              }
            })()
          }
        >
          Reject
        </Button>
      </div>
    </li>
  );
})}
```

- [ ] **Step 3: Verify**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

Run: `pnpm dev` → submit a test resource → log in as admin → view queue → set category + tags → approve.
Expected: resource shows up in `resources` table with the admin-curated category/tags.

- [ ] **Step 4: Commit**

```bash
git add convex/resourceSubmissions.ts components/admin/admin-resources-client.tsx
git commit -m "feat(admin): full review UI — set category/tags/communities/stage before approve"
```

---

## Task 12: ResourceRow component + test

**Files:**
- Create: `components/resources/resource-row.tsx`
- Create: `components/resources/resource-card.tsx`
- Create: `tests/resource-row.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/resource-row.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResourceRow } from "../components/resources/resource-row";

const sample = {
  _id: "r1" as unknown as never,
  title: "Utah Innovation Fund",
  slug: "utah-innovation-fund",
  description: "Pre-seed and seed capital for Utah deep-tech.",
  url: "https://example.com",
  category: "capital-funding" as const,
  tags: ["AI"],
  stageTags: ["Pre-seed"],
  communities: ["Veterans"],
};

describe("ResourceRow", () => {
  it("renders title, description snippet, and key badges", () => {
    render(<ResourceRow resource={sample} />);
    expect(screen.getByText("Utah Innovation Fund")).toBeInTheDocument();
    expect(screen.getByText(/Pre-seed and seed capital/)).toBeInTheDocument();
    expect(screen.getByText("Veterans")).toBeInTheDocument();
    expect(screen.getByText("Pre-seed")).toBeInTheDocument();
  });

  it("links the title to the detail page", () => {
    render(<ResourceRow resource={sample} />);
    const link = screen.getByRole("link", { name: /Utah Innovation Fund/i });
    expect(link.getAttribute("href")).toContain("/resources/utah-innovation-fund");
  });
});
```

(Vitest needs jsdom + testing-library setup. If not yet configured, add to `vitest.config.ts`:

```ts
test: {
  environment: "jsdom",
  globals: false,
  include: ["tests/**/*.test.{ts,tsx}"],
},
```

And add devDeps:

```bash
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
```

Plus a `tests/setup.ts` with `import '@testing-library/jest-dom/vitest'` and reference it in `vitest.config.ts` `setupFiles`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/resource-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ResourceRow`**

```tsx
// components/resources/resource-row.tsx
"use client";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link as UiLink } from "@/components/ui/link";
import type { ResourceCategoryKey } from "@/lib/resources/categories";

export type ResourceRowData = {
  _id: unknown;
  title: string;
  slug: string;
  description: string;
  url: string;
  category?: ResourceCategoryKey;
  tags: string[];
  stageTags: string[];
  communities: string[];
};

export function ResourceRow({ resource }: { resource: ResourceRowData }) {
  const stage = resource.stageTags[0];
  const community = resource.communities[0];
  const featuredTag = resource.tags[0];

  return (
    <div className="group grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border px-4 py-3 hover:bg-muted/40">
      <div className="min-w-0">
        <Link
          href={`/resources/${resource.slug}`}
          className="block text-base font-medium text-fg hover:underline"
        >
          {resource.title}
        </Link>
        <Text className="text-muted-fg mt-1 line-clamp-1 text-sm">
          {resource.description}
        </Text>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {community ? <Badge intent="outline" className="text-xs">{community}</Badge> : null}
          {stage ? <Badge intent="outline" className="text-xs">{stage}</Badge> : null}
          {featuredTag ? <Badge intent="outline" className="text-xs">{featuredTag}</Badge> : null}
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger>
          <UiLink
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${resource.title} in a new tab`}
            className="text-muted-fg hover:text-fg p-1"
          >
            ↗
          </UiLink>
        </TooltipTrigger>
        <TooltipContent>Open official site</TooltipContent>
      </Tooltip>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ResourceCard` (mobile + extracted from current inline JSX)**

```tsx
// components/resources/resource-card.tsx
"use client";

import { Link } from "@/i18n/navigation";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link as UiLink } from "@/components/ui/link";
import type { ResourceRowData } from "./resource-row";

export function ResourceCard({ resource }: { resource: ResourceRowData }) {
  return (
    <Card className="bg-overlay">
      <CardHeader className="pb-3">
        <CardTitle>{resource.title}</CardTitle>
        <CardDescription className="line-clamp-4">{resource.description}</CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Link
          href={`/resources/${resource.slug}`}
          className={buttonStyles({ intent: "outline", size: "sm" })}
        >
          View details
        </Link>
        <UiLink
          href={resource.url}
          className={buttonStyles({ intent: "outline", size: "sm" })}
          rel="noopener noreferrer"
          target="_blank"
        >
          Official site
        </UiLink>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 5: Run test — verify pass**

Run: `pnpm exec vitest run tests/resource-row.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/resources/resource-row.tsx components/resources/resource-card.tsx tests/resource-row.test.tsx vitest.config.ts tests/setup.ts package.json pnpm-lock.yaml
git commit -m "feat(resources): ResourceRow + ResourceCard components"
```

---

## Task 13: Browse list rewrite — desktop grouped rows + mobile cards + category chips

**Files:**
- Modify: `components/resources/resources-browse-client.tsx`
- Modify: `components/resources/resource-detail-client.tsx`

- [ ] **Step 1: Replace `resources-browse-client.tsx`**

```tsx
"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { FounderQuizClient } from "@/components/quiz/founder-quiz-client";
import { ResourceCard } from "@/components/resources/resource-card";
import { ResourceRow } from "@/components/resources/resource-row";
import { ResourceSubmitForm } from "@/components/resources/resource-submit-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  DisclosureTrigger,
} from "@/components/ui/disclosure-group";
import { Heading } from "@/components/ui/heading";
import { ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import { useSidebar } from "@/components/ui/sidebar";
import {
  RESOURCE_CATEGORIES,
  type ResourceCategoryKey,
} from "@/lib/resources/categories";

export function ResourcesBrowseClient() {
  const grouped = useQuery(api.resources.listGroupedByCategory, { limitPerCategory: 50 });
  const [activeCategory, setActiveCategory] = useState<ResourceCategoryKey | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const { toggleSidebar } = useSidebar();

  const visibleCategories = activeCategory
    ? RESOURCE_CATEGORIES.filter((c) => c.key === activeCategory)
    : RESOURCE_CATEGORIES;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <section className="space-y-6">
        <div className="max-w-3xl">
          <Text className="text-muted-fg">Resource Library</Text>
          <Heading level={1} className="mt-2 text-4xl tracking-tight sm:text-5xl">
            Utah founder resources
          </Heading>
          <Text className="mt-4 max-w-2xl text-lg text-muted-fg">
            Curated partners and programs sourced from Startup Utah Builder Day. Filter by category,
            search from the top bar, or ask the AI guide for a recommended path.
          </Text>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-overlay">
            <CardHeader title="Get matched" description="Take the founder quiz to tune recommendations." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setQuizOpen(true)}>Start quiz</Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader title="Ask the guide" description="Open the AI chat for funding and program questions." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={toggleSidebar}>Ask AI guide</Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader title="Add a resource" description="Submit a partner or program for review." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setSubmitOpen(true)}>Submit</Button>
            </CardFooter>
          </Card>
        </div>

        <ModalContent isOpen={quizOpen} onOpenChange={setQuizOpen} size="2xl" aria-label="Founder quiz">
          <ModalHeader><ModalTitle>Founder quiz</ModalTitle></ModalHeader>
          <ModalBody className="pb-6"><FounderQuizClient onComplete={() => setQuizOpen(false)} /></ModalBody>
        </ModalContent>

        <ModalContent isOpen={submitOpen} onOpenChange={setSubmitOpen} size="xl" aria-label="Submit a resource">
          <ModalHeader><ModalTitle>Submit a resource</ModalTitle></ModalHeader>
          <ModalBody className="pb-6"><ResourceSubmitForm /></ModalBody>
        </ModalContent>
      </section>

      <section className="space-y-3">
        <Heading level={2} className="text-lg">Categories</Heading>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            intent={activeCategory === null ? "primary" : "secondary"}
            onPress={() => setActiveCategory(null)}
          >
            All resources
          </Button>
          {RESOURCE_CATEGORIES.map((c) => (
            <Button
              key={c.key}
              size="sm"
              intent={activeCategory === c.key ? "primary" : "secondary"}
              onPress={() => setActiveCategory(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="min-w-0 flex-1 space-y-4">
        {grouped === undefined ? (
          <Text className="text-muted-fg">Loading resources…</Text>
        ) : (
          <>
            {/* Desktop: grouped rows */}
            <div className="hidden md:block">
              <DisclosureGroup defaultExpandedKeys={visibleCategories.map((c) => c.key)}>
                {visibleCategories.map((c) => {
                  const list = grouped[c.key] ?? [];
                  if (list.length === 0) return null;
                  return (
                    <Disclosure key={c.key} id={c.key}>
                      <DisclosureTrigger>
                        <span className="font-medium">{c.label}</span>
                        <span className="text-muted-fg ml-2 text-sm">{list.length}</span>
                      </DisclosureTrigger>
                      <DisclosurePanel>
                        <div className="rounded-lg border border-border bg-overlay">
                          {list.map((r) => (
                            <ResourceRow key={String(r._id)} resource={r} />
                          ))}
                        </div>
                      </DisclosurePanel>
                    </Disclosure>
                  );
                })}
              </DisclosureGroup>
            </div>

            {/* Mobile: cards under category headings */}
            <div className="md:hidden space-y-6">
              {visibleCategories.map((c) => {
                const list = grouped[c.key] ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={c.key} className="space-y-3">
                    <Heading level={3} className="text-base">{c.label}</Heading>
                    <div className="grid gap-4">
                      {list.map((r) => (
                        <ResourceCard key={String(r._id)} resource={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Update detail page to surface category badge**

In `components/resources/resource-detail-client.tsx`, add the import:

```tsx
import { categoryLabel, type ResourceCategoryKey } from "@/lib/resources/categories";
```

Insert right after the title's `Heading`, before the description:

```tsx
{resource.category ? (
  <Badge intent="primary" className="mt-2 text-xs">
    {categoryLabel(resource.category as ResourceCategoryKey)}
  </Badge>
) : null}
```

In the `ChipRow`s, replace the "Topics" row with "Tags":

```tsx
<ChipRow label="Tags" values={(resource as { tags?: string[] }).tags ?? resource.topics} />
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors. The disclosure-group exports used (`DisclosureGroup`, `Disclosure`, `DisclosureTrigger`, `DisclosurePanel`) match the component file.

- [ ] **Step 4: Manual verification in browser**

Run: `pnpm dev`
Open: `http://localhost:3000/resources` at desktop width — sections render with rows, click a row to navigate, click external icon to open new tab, click category chips to narrow.
Resize to mobile width — sections become headings with cards below.

- [ ] **Step 5: Commit**

```bash
git add components/resources/resources-browse-client.tsx components/resources/resource-detail-client.tsx
git commit -m "feat(resources): grouped rows on desktop, cards on mobile, category chips"
```

---

## Task 14: Tighten schema — drop `topics`, make `category` required

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/resourceValidators.ts`
- Modify: `convex/lib/resourceHelpers.ts`
- Modify: `convex/resourceInternal.ts`
- Modify: `convex/resources.ts`
- Modify: `convex/lib/matchResources.ts`
- Modify: `scripts/seed-resources.ts`

> **Pre-flight:** Run `pnpm exec convex run resourceMigration:backfillCategoriesAndTags '{}'` once more to be sure every row has `category` + `tags`. If the response shows `lowConfidence > 0`, fix those rows via `setCategoryById` first.

- [ ] **Step 1: Drop `topics` and make `category`/`tags` required in schema**

In `convex/schema.ts`, change `resources` table fields:

```ts
resources: defineTable({
  title: v.string(),
  slug: v.string(),
  description: v.string(),
  url: v.string(),
  contactEmail: v.optional(v.string()),
  sourceId: v.optional(v.string()),
  communities: v.array(v.string()),
  industries: v.array(v.string()),
  locations: v.array(v.string()),
  tags: v.array(v.string()),                          // now required
  category: resourceCategoryValidator,                // now required
  stageTags: v.array(v.string()),
  searchText: v.string(),
  status: resourceStatusValidator,
  submissionId: v.optional(v.id('resourceSubmissions')),
  lastSyncedAt: v.optional(v.number()),
  embeddingVersion: v.optional(v.number()),
})
  // ...indexes unchanged...
```

Also drop `'topic'` from `facetTypeValidator` in `convex/resourceValidators.ts`:

```ts
export const facetTypeValidator = v.union(
  v.literal('community'),
  v.literal('industry'),
  v.literal('location'),
  v.literal('tag'),
  v.literal('stage'),
  v.literal('category'),
);
```

- [ ] **Step 2: Delete `'topic'` facet rows in a one-shot**

Add to `convex/resourceMigration.ts`:

```ts
export const dropTopicFacetRows = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('resourceFacets')
      .filter((q) => q.eq(q.field('facetType'), 'topic'))
      .take(10000);
    for (const r of rows) {
      await ctx.db.delete(r._id);
    }
    return { deleted: rows.length };
  },
});
```

Run: `pnpm exec convex run resourceMigration:dropTopicFacetRows '{}'`
Expected: deletes all `'topic'` facets.

- [ ] **Step 3: Strip `topics` references from helpers, upsert, queries, matching, seed**

Walk through each file and remove every reference to `topics` / `topicsRaw` / `inferStageTagsFromTopics`. The fields and functions to delete:

- `convex/lib/resourceHelpers.ts`: drop `topics` from `buildSearchText` / `embeddingSourceText` / `facetsFromResourceFields` parameter shapes; delete `inferStageTagsFromTopics` (admin-set stageTags now)
- `convex/resourceInternal.ts`: drop `topicsRaw` from validator + remove the `splitPipeList(row.topicsRaw)` line and pass `stageTags: []` if the row didn't supply them (admin path supplies them via patch in `approve`)
- `convex/resourceImport.ts`: drop `topicsRaw` from `importRow`
- `convex/resources.ts`: drop `topics` from projections
- `convex/lib/matchResources.ts`: drop `topics` from the type pick + drop the topic loop in the score function (`tags` only):

```ts
type ResourceTags = Pick<
  Doc<'resources'>,
  'communities' | 'industries' | 'locations' | 'tags' | 'stageTags' | 'category'
>;

// in scoreResourceForProfile, replace `tagPool`:
const tagPool = resource.tags;
```

- `scripts/seed-resources.ts`: rename `topicsRaw` → `tagsRaw` and add a `category` derivation step:

```ts
import { assignCategory, cleanTags } from '../lib/resources/migration-rules';

const rows = parsed.data
  .filter((r) => r.Title && r.link)
  .map((r) => {
    const topicsList = r.Topics ? r.Topics.split('|').map((s) => s.trim()).filter(Boolean) : [];
    const { category } = assignCategory({ title: r.Title, topics: topicsList });
    return {
      sourceId: r.id,
      title: r.Title,
      description: r.description,
      url: r.link,
      contactEmail: sanitizeContactEmail(r.email),
      communitiesRaw: r.Communities,
      industriesRaw: r.Industries,
      locationsRaw: r.Locations,
      tagsRaw: cleanTags(topicsList).join('|'),
      category,
    };
  });
```

- [ ] **Step 4: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Push schema**

Run: `pnpm exec convex dev --once`
Expected: schema deploy succeeds. If validation rejects any row, the row is missing `category` or `tags` — fix via `setCategoryById` and re-run.

- [ ] **Step 6: Smoke test**

Run: `pnpm dev` — verify `/resources` still loads and seeds, submit form still works, admin still works, quiz/AI guide still rank resources.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/resourceValidators.ts convex/lib/resourceHelpers.ts convex/resourceInternal.ts convex/resourceImport.ts convex/resources.ts convex/lib/matchResources.ts convex/resourceMigration.ts scripts/seed-resources.ts
git commit -m "chore(resources): drop legacy topics field, make category + tags required"
```

---

## Self-Review Checklist (before handoff)

Run through this as the final gate:

- [ ] Spec section "Layout" → covered by Tasks 12, 13
- [ ] Spec section "Components (Intent UI / React Aria)" → covered by Tasks 10, 11, 12, 13
- [ ] Spec section "Taxonomy" → covered by Tasks 1, 2, 3, 4
- [ ] Spec section "Schema changes" → covered by Tasks 3, 14
- [ ] Spec section "Backend query changes" → covered by Tasks 5, 8
- [ ] Spec section "Migration" → covered by Tasks 6, 7
- [ ] Spec section "Submit form changes" → covered by Task 10
- [ ] Spec section "Admin moderation changes" → covered by Task 11
- [ ] Spec section "Filter bar" → covered by Task 13
- [ ] Spec section "Quiz/AI guide matching weighted by `category`" → covered by Task 9
- [ ] Spec section "Detail page category badge" → covered by Task 13 Step 2
