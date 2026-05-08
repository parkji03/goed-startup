# Utah Startup State — Project Plan

**Event:** Utah GOED AI Builder Day Hackathon
**Deliverable:** Production-ready platform for the Startup State initiative
**Customer:** Utah Governor's Office of Economic Development (GOED)
**Window:** 48 hours, plus handoff documentation

---

## 1. Executive Summary

We are building a single Next.js application backed by Convex that the State of Utah can take over and run for years. It contains three product surfaces sharing one backend:

1. **The Founder's Navigator** — guided intake flow that produces a personalized action plan
2. **The Resource Guide** — natural-language AI chat over the full resource catalog
3. **The Utah Startup Map** — interactive map with self-service company profiles

Plus a fourth surface for the people who run it:

4. **The GOED Admin** — custom-built admin UI for non-technical staff to manage resources and moderate company submissions

We are optimizing for two simultaneous outcomes:

- **Win the weekend.** A polished, working prototype demoable on Sunday with all six personas validated.
- **Be production-ready for GOED.** Boring, portable runtime choices. A handoff runbook a state contractor can follow without us. Convex is self-hostable, so we are not locking GOED into a vendor.

**Non-negotiables from the spec:**
- Personalized experience that adapts to user context
- Easily updatable without a developer (real CMS, custom-built on Convex)
- Self-service company profiles with lightweight verification
- Production-quality UI worthy of investors

**Architectural extensibility seam:** Internationalization. We ship English-only but the schema, routing, AI prompts, and UI strings are structured so adding Spanish (or any other language) is data entry, not a rewrite.

**Strategic call:** Build the Navigator + Resource Guide + Admin deeply. Map gets a strong MVP if Workstream E stays on schedule. Depth beats breadth — judging weights Usability (30%) + Design (25%) = 55% on polish.

---

## 2. Product Scope

### 2.1 The Founder's Navigator

A 90-second guided journey from "I have an idea" to "here are your next 3 moves."

**Flow:**
1. Landing — single hero question with 4-5 visual entry points
2. Adaptive intake — 3-5 branching questions (location, industry, stage, blocker, demographic eligibility)
3. Personalized plan — prioritized actions, qualifying programs, people to contact, with citations
4. Save/share — email plan, return via link
5. Optional — "Ask follow-up questions" handoff to Resource Guide with intake context preserved

**Acceptance criteria:** All 6 personas in the spec produce meaningfully different, useful plans. Verifiable on `/demo` page.

### 2.2 The Resource Guide (AI Chat)

Open-ended natural-language Q&A over the resource catalog. Composes with the Navigator — after the intake plan, users can keep asking questions with context preserved.

**Behavior contract:**
- Every claim cites the source resource (link to startup.utah.gov page)
- Refuses to invent resources — if no match, says so and suggests adjacent options
- Personalization-aware — uses Navigator intake context if available
- Locale-aware — answers in the user's selected language (English at launch)
- Streamed responses
- Rate-limited per IP and globally

### 2.3 The Utah Startup Map

Interactive visual map of every business in the Utah ecosystem. Two audiences: founders looking for partners/customers/employers, and investors evaluating Utah's ecosystem.

**Required fields per company:** name, website, employees, sector, year founded, LinkedIn, description, address, hiring status, job postings, photo gallery.

**Self-service:**
- Anyone can submit a new company (lands in `pending` moderation queue)
- Existing listings can be claimed via magic link to email matching the company's website domain
- Claimed-listing edits auto-publish but log a diff for GOED review

**Filters:** sector, size, stage, hiring status, location.

### 2.4 The GOED Admin

Custom-built admin UI at `/admin`. **This is the "easily updatable without a developer" deliverable.** It is not the Convex dashboard — that's a developer tool. This is a curated, role-gated UI for state staff.

**Capabilities:**
- Resources: full CRUD with rich-text description, tag picker, instant preview
- **Per-locale translation tabs** on each resource (English at launch; Spanish slot scaffolded but disabled)
- Companies: moderation queue (approve/reject pending submissions), edit any listing, view diff log
- Conversations: read-only review of recent chat sessions for quality monitoring
- Live re-embedding: when staff edit a resource, the synthetic-query regeneration and embedding refresh kick off automatically and surface status in the UI

**Auth:** Convex Auth with magic links to allowlisted GOED email addresses. No password management.

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     Next.js 15 App (Vercel)                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Public Surfaces (under /[locale]/...)                  │  │
│  │   /                  Landing                           │  │
│  │   /navigator         Intake flow → plan                │  │
│  │   /chat              Resource Guide (AI)               │  │
│  │   /map               Utah Startup Map                  │  │
│  │   /companies/[slug]  Company profile                   │  │
│  │   /demo              Persona walkthroughs (judges)     │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Authenticated Surfaces                                 │  │
│  │   /admin             GOED staff CMS                    │  │
│  │   /admin/resources   CRUD + tag editor + locale tabs   │  │
│  │   /admin/companies   Moderation queue                  │  │
│  │   /admin/conversations  Quality review                 │  │
│  │   /claim/[token]     Company-claim landing             │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Next.js Route Handlers                                 │  │
│  │   /api/chat            Streaming chat (calls Convex)   │  │
│  │   /api/navigator/plan  Plan generation                 │  │
│  └────────────────────────────────────────────────────────┘  │
│  next-intl middleware handles locale detection + routing     │
│  React Aria I18nProvider wraps the app for component-level   │
│  locale awareness (date/number formatting, RTL, ARIA labels) │
└─────────────────────────┬────────────────────────────────────┘
                          │ Convex client (typed RPC + reactive)
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                          Convex                              │
│  Tables                                                      │
│   resources                Non-translatable canonical data   │
│   resourceTranslations     Per-locale text + embedding       │
│                            [vectorIndex on `embedding`,      │
│                             filter on `locale`]              │
│   companies                                                  │
│   users                                                      │
│   conversations                                              │
│   plans                                                      │
│   claimTokens                                                │
│  Functions                                                   │
│   queries/        Read-only, reactive                        │
│   mutations/      Atomic writes                              │
│   actions/        Side-effects (Anthropic, OpenAI, Resend)   │
│   http/           HTTP actions for chat streaming            │
│  Crons & Scheduled Functions                                 │
│   embedTranslation, generateSyntheticQueries, expirePlans    │
│  Built-in: Auth, File storage, Rate limit, Vector search     │
└──────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        │                 │                  │
   ┌────▼────┐      ┌─────▼─────┐      ┌─────▼─────┐
   │Anthropic│      │  OpenAI   │      │  Resend   │
   │ Claude  │      │ Embeddings│      │   Email   │
   └─────────┘      └───────────┘      └───────────┘
```

**Core principles:**
- Convex is the only backend. Next.js is a rendering and routing layer.
- Reactive queries everywhere — admin edits show up live in chat answers without manual refresh.
- File storage uses Convex's built-in (no separate R2/S3 to provision).
- All AI calls go through Convex actions so we have one place to enforce rate limits and budget caps.
- Locale is a first-class concept threaded through routing, schema, AI prompts, and UI components from day one.

---

## 4. Technology Stack (Locked)

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | RSC, route handlers, deployable to Vercel and Docker equivalently |
| UI components | **Intent UI (React Aria Components + Tailwind)** | Most accessible primitives in React, locale-aware out of the box, comprehensive coverage (Tables, ComboBox, DatePicker), Tailwind-native styling |
| Styling | Tailwind CSS | Standard, fast, works seamlessly with Intent UI |
| Internationalization | **`next-intl`** | De facto Next.js i18n library, RSC-compatible, locale routing, ICU message format, plays well with React Aria's `I18nProvider` |
| Backend / DB | Convex | Reactive DB, built-in vector search, file storage, jobs, auth, rate limit |
| Admin UI | Custom — Intent UI + Convex queries | Replaces Payload's batteries-included admin |
| Auth | Convex Auth (magic link) | Same primitive for GOED staff and company claimants |
| AI orchestration | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) | Streaming + `useChat`; called from Convex HTTP actions |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Best balance of quality, latency, cost; multilingual |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) | Cheap, well-supported by Convex vector index, multilingual capability sufficient for our scale |
| Vector search | Convex `vectorIndex` with `locale` filter field | No pgvector to provision; locale-aware retrieval |
| Rate limiting | Convex `@convex-dev/rate-limiter` | First-party component |
| Cache (chat responses) | Convex tables with TTL via cron | No separate Redis |
| Maps | Mapbox GL JS (escape hatch: MapLibre GL) | Generous free tier, polished default styling, API-compatible OSS fallback |
| Email | Resend | Magic links + plan-share emails; templates per locale |
| Observability | Sentry + Vercel Analytics + Convex's built-in dashboard | Errors, traffic, function metrics |
| CI/CD | GitHub Actions | Standard, portable |
| Container runtime (handoff) | Docker (Next.js + self-hosted Convex) | Decouples deployment from Vercel and Convex Cloud |

**Explicit rejections:**
- No shadcn/ui — Intent UI's React Aria foundation is stronger for accessibility and i18n
- No Payload CMS (would require Postgres; Convex doesn't fit)
- No LlamaIndex / LangChain — Convex's vector search + a prompt is the entire RAG pipeline
- No GraphQL — Convex's RPC is the API
- No separate Postgres, pgvector, Redis, or jobs queue — Convex covers all of these
- No client-side database access — all reads/writes through Convex's typed client

---

## 5. Repository Structure

```
ai-builder-day/
├── apps/
│   └── web/                          # Next.js app
│       ├── app/
│       │   ├── [locale]/             # Locale segment — every public route lives here
│       │   │   ├── (public)/
│       │   │   │   ├── page.tsx      # Landing
│       │   │   │   ├── navigator/
│       │   │   │   ├── chat/
│       │   │   │   ├── map/
│       │   │   │   ├── companies/[slug]/
│       │   │   │   └── demo/
│       │   │   ├── (admin)/admin/    # GOED staff CMS (locale-aware too)
│       │   │   │   ├── layout.tsx    # Auth gate
│       │   │   │   ├── resources/
│       │   │   │   ├── companies/
│       │   │   │   └── conversations/
│       │   │   └── claim/[token]/
│       │   ├── api/
│       │   │   ├── chat/route.ts     # Streams from Convex HTTP action
│       │   │   └── navigator/plan/route.ts
│       │   └── i18n/
│       │       ├── routing.ts        # Locale config: 'en' default, 'es' scaffolded
│       │       ├── request.ts        # Server-side locale loading
│       │       └── navigation.ts     # Typed Link / redirect / useRouter
│       ├── messages/                 # next-intl message catalogs
│       │   ├── en.json               # Populated
│       │   └── es.json               # Stub for Spanish — empty/partial at launch
│       ├── components/
│       │   ├── navigator/
│       │   ├── chat/
│       │   ├── map/
│       │   ├── admin/                # CRUD tables, forms, moderation queue
│       │   └── ui/                   # Intent UI wrappers
│       ├── lib/
│       │   ├── personas.ts           # 6 spec personas as test fixtures
│       │   └── convex.ts             # Convex client setup
│       ├── middleware.ts             # next-intl locale detection
│       └── tests/
│           ├── personas.test.ts      # plan generation acceptance tests
│           └── retrieval.test.ts
├── convex/                           # Convex backend
│   ├── schema.ts                     # All tables + indexes (i18n-aware)
│   ├── auth.config.ts
│   ├── auth.ts
│   ├── resources/
│   │   ├── queries.ts                # list, byId, search
│   │   ├── mutations.ts              # create, update, delete
│   │   └── actions.ts                # generateSyntheticQueries, embed
│   ├── translations/
│   │   ├── queries.ts                # listByResource, byLocale
│   │   ├── mutations.ts              # upsertTranslation
│   │   └── actions.ts                # autoTranslate (future, stubbed)
│   ├── companies/
│   ├── chat/
│   │   ├── queries.ts                # retrieveContext (vector search, locale-filtered)
│   │   └── http.ts                   # streaming chat HTTP action
│   ├── navigator/
│   │   └── actions.ts                # generatePlan (locale-aware)
│   ├── conversations/
│   ├── crons.ts
│   ├── ai/
│   │   ├── claude.ts
│   │   ├── embed.ts
│   │   ├── budget.ts
│   │   └── prompts/
│   │       ├── synthetic-queries.ts  # accepts { resource, locale } params
│   │       ├── plan-generation.ts    # accepts { intake, locale }
│   │       └── chat-system.ts        # accepts { resources, intake, locale }
│   └── _generated/                   # Convex codegen (gitignored)
├── data/
│   ├── seed/
│   │   ├── resources.csv             # exported from provided sheet
│   │   ├── companies.csv
│   │   └── seed.ts                   # one-shot import (creates resource + en translation)
│   └── README.md
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   └── docker-compose.selfhost.yml
│   └── README.md
├── docs/
│   ├── HANDOFF.md
│   ├── DEMO_SCRIPT.md
│   ├── ACCESSIBILITY.md
│   ├── I18N.md                       # How to add a new locale
│   └── PROMPT_ENGINEERING.md
├── .github/workflows/
├── .env.example
├── PROJECT_PLAN.md                   # this file
└── README.md
```

---

## 6. Data Model (Convex Schema)

`convex/schema.ts` — abbreviated. Translatable text lives in a separate `resourceTranslations` table so adding languages later is data entry, not migration.

```ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  // Non-translatable canonical resource data
  resources: defineTable({
    slug: v.string(),
    url: v.string(),                        // citation source on startup.utah.gov
    tags: v.object({
      stage: v.array(v.string()),
      industry: v.array(v.string()),
      geography: v.array(v.string()),
      counties: v.array(v.string()),
      demographic: v.array(v.string()),
      resourceType: v.array(v.string()),
    }),
    defaultLocale: v.string(),              // 'en' for now
    availableLocales: v.array(v.string()),  // ['en'] at launch; ['en','es'] later
  }).index('by_slug', ['slug']),

  // Per-locale text + embedding for a resource
  resourceTranslations: defineTable({
    resourceId: v.id('resources'),
    locale: v.string(),                     // 'en', 'es', ...
    title: v.string(),
    description: v.string(),                // markdown
    eligibility: v.optional(v.string()),
    syntheticQueries: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
    embeddingUpdatedAt: v.optional(v.number()),
    embeddingStatus: v.union(
      v.literal('pending'), v.literal('ready'), v.literal('failed')
    ),
    translatedBy: v.optional(v.union(
      v.literal('human'), v.literal('llm-auto'), v.literal('seed')
    )),
  })
    .index('by_resource_locale', ['resourceId', 'locale'])
    .index('by_locale', ['locale'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['locale', 'resourceId'],  // chat retrieval filters by user's locale
    }),

  companies: defineTable({
    name: v.string(),
    slug: v.string(),
    website: v.string(),                    // domain used for claim verification
    description: v.string(),                // company-authored, single-locale at launch
    sector: v.string(),
    stage: v.string(),
    employeeCount: v.string(),
    yearFounded: v.number(),
    location: v.object({
      lat: v.number(), lng: v.number(),
      city: v.string(), county: v.string(), address: v.string(),
    }),
    linkedin: v.optional(v.string()),
    hiringStatus: v.union(
      v.literal('actively'), v.literal('occasionally'), v.literal('not')
    ),
    jobPostings: v.array(v.object({
      title: v.string(), link: v.string(), department: v.optional(v.string()),
    })),
    photos: v.array(v.id('_storage')),
    status: v.union(
      v.literal('pending'), v.literal('published'), v.literal('archived')
    ),
    claimedBy: v.optional(v.id('users')),
    lastEditedAt: v.number(),
    diffLog: v.array(v.object({
      userId: v.optional(v.id('users')),
      timestamp: v.number(),
      changes: v.string(),
    })),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status'])
    .index('by_county', ['location.county'])
    .index('by_sector', ['sector']),

  users: defineTable({
    email: v.string(),
    role: v.union(
      v.literal('admin'), v.literal('staff'), v.literal('claimant')
    ),
    associatedCompany: v.optional(v.id('companies')),
    preferredLocale: v.optional(v.string()),
  }).index('by_email', ['email']),

  claimTokens: defineTable({
    token: v.string(),
    companyId: v.id('companies'),
    email: v.string(),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
  }).index('by_token', ['token']),

  conversations: defineTable({
    sessionId: v.string(),
    locale: v.string(),                     // captured at session start
    messages: v.array(v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
      timestamp: v.number(),
      citations: v.optional(v.array(v.id('resources'))),
    })),
    intakeContext: v.optional(v.any()),
    feedback: v.optional(v.object({
      thumbsUp: v.boolean(),
      comment: v.optional(v.string()),
    })),
    expiresAt: v.number(),
  }).index('by_session', ['sessionId']),

  plans: defineTable({
    shareSlug: v.string(),
    locale: v.string(),
    intake: v.any(),
    generatedPlan: v.string(),              // markdown, in user's locale
    recommendedResources: v.array(v.id('resources')),
    emailedTo: v.optional(v.string()),
    expiresAt: v.number(),
  }).index('by_slug', ['shareSlug']),

  budgetLedger: defineTable({
    day: v.string(),                        // YYYY-MM-DD
    spendUsd: v.number(),
    callsCount: v.number(),
  }).index('by_day', ['day']),
});
```

**Reactivity contract:** any mutation to `resourceTranslations` triggers re-execution of dependent queries (admin tables, chat retrieval). The chat UI subscribed to `conversations` automatically receives new messages. This is what makes the "edit a resource, watch the answer update" demo moment work.

**Vector search:** Convex's `vectorIndex` supports `filterFields`. Chat retrieval filters by the user's `locale`, so Spanish queries hit Spanish embeddings — once Spanish translations exist. Today, all rows are `locale: 'en'` and the filter is a no-op.

---

## 7. Internationalization & Extensibility Architecture

This section is the load-bearing piece for "leave room for easy extensibility." Every decision below is what we do *now*, even though we ship English-only, so adding a language later is data entry plus translator review — not a refactor.

### 7.1 Locale routing

- Every public route lives under `app/[locale]/...`
- `next-intl`'s middleware detects locale from URL prefix → cookie → `Accept-Language` header → fallback to `en`
- `routing.ts` declares the supported locales: `['en']` at launch, `['en','es']` when Spanish ships
- Hreflang tags emitted in `<head>` for SEO across locales
- Locale switcher component in the global header (hidden when only one locale is enabled, visible the moment a second is added)

### 7.2 Static UI strings

- All user-facing text in components flows through `useTranslations()` (client) or `getTranslations()` (server components)
- Source of truth: `messages/en.json` with ICU message format for plurals, gendered terms, dates, numbers
- `messages/es.json` exists from day one as a stub. Most keys are empty strings or marked `__MISSING__` so a translator can do a single pass to enable Spanish
- Lint rule: any `<p>raw English</p>` in a component fails CI. Forces every string through the i18n layer

### 7.3 Component-level locale awareness

- Intent UI's React Aria foundation means components like `DatePicker`, `NumberField`, `Calendar` automatically format per locale
- We wrap the app root in React Aria's `<I18nProvider locale={locale}>` so accessibility labels announce in the user's language
- Currency, dates, employee-count ranges all formatted via `Intl` APIs, never hardcoded

### 7.4 Dynamic content (resources)

The resource catalog is the largest body of translatable content. The schema split into `resources` + `resourceTranslations` means:

- Each resource has 1..N translation rows (one per locale it's been translated into)
- `resources.availableLocales` array tracks which translations exist
- Admin UI shows a per-locale tab on each resource edit form. English required; others optional
- Chat retrieval filters embeddings by user locale. If no Spanish translation exists for a resource, that resource can't be retrieved for a Spanish query — but a fallback "search English content too" toggle is configurable

### 7.5 AI-generated content (plans, chat answers)

- All AI prompts accept a `locale` parameter and instruct Claude to respond in that language
- Claude Sonnet 4.6 is strong in Spanish, French, German, Mandarin, and many others — quality holds well past English
- Synthetic queries are generated *per locale*: when Spanish content is added, the synthetic-query action runs again to produce Spanish-language founder questions
- Generated plans (`plans.generatedPlan`) are stored in the locale they were generated in, with `plans.locale` recorded for the share page

### 7.6 Dynamic content (companies)

Companies are user-authored by the businesses themselves. We do **not** auto-translate company descriptions — companies write their own copy. We support multi-locale storage in the schema (a future `companyTranslations` table can mirror the resource pattern) but at launch a company is single-locale, with `defaultLocale` = the locale they submitted in.

This is a deliberate "documented gap" in the handoff: if GOED later wants companies to localize their listings, the schema migration is straightforward.

### 7.7 Embedding strategy across locales

OpenAI's `text-embedding-3-small` is multilingual — Spanish and English embeddings live in the same 1536-dim vector space and have meaningful cross-language similarity. But embedding *each translation independently* gives stronger same-language recall. We do the latter:

- Each `resourceTranslations` row has its own embedding
- The vector index filters on `locale` so retrieval stays in-language
- If a user query has no in-language matches above a threshold, we can fall back to cross-language retrieval (configurable, off at launch)

### 7.8 Email and outbound communication

- Resend templates per locale
- Magic-link emails, plan-share emails, claim-verification emails all live in `messages/<locale>/emails/`
- User's `preferredLocale` (or detected locale at request time) determines the template

### 7.9 What we ship this weekend

- Full architecture above is implemented for `en` only
- `es` slot is scaffolded: route works, message file exists, schema supports it, admin UI shows the disabled tab
- `docs/I18N.md` walks GOED through enabling Spanish: translate `messages/es.json`, add `'es'` to `routing.ts`, populate `resourceTranslations` rows for the resource catalog, run the embedding action

### 7.10 What this costs us

- ~90 minutes added to Workstream A's foundation (next-intl setup, routing, middleware, message file scaffolding)
- ~30 minutes added to Workstream B (schema split + seed creates resource + en translation rows)
- ~30 minutes added to Workstream G (locale tabs in admin form, even if only English is enabled)
- Zero added to Workstreams C/D/E if they use the i18n hooks correctly from the start

About 2.5 hours of total scaffolding for an extensibility seam GOED can use for years.

---

## 8. Deployment & Infrastructure

### 8.1 Demo-weekend deployment

| Service | Tier | Purpose |
|---|---|---|
| Vercel | Hobby (free) → Pro if needed | Hosts Next.js (frontend + admin UI) |
| Convex Cloud | Free tier (1M function calls, 100MB storage, 5GB bandwidth) | Backend, DB, vector search, file storage, jobs |
| Cloudflare DNS | Free | Domain + SSL |
| Sentry | Developer (free, 5k events) | Errors |
| Resend | Free (100 emails/day) | Magic links |
| Mapbox | Free tier (50k loads/mo) | Map tiles |

The Convex free tier covers the entire weekend.

### 8.2 Handoff target (documented for GOED)

Two paths, both documented:

**Path A — Convex Cloud (recommended).** GOED creates their own Convex team, we transfer the project. Convex Pro is $25/team/mo + usage.

**Path B — Self-hosted Convex.** Convex's backend is open-source and runs in Docker. `infra/docker/docker-compose.selfhost.yml` describes the full stack. Deploys to AWS ECS, Azure Container Apps, or any Kubernetes cluster.

### 8.3 Cost breakdown — what we spend this weekend

**Required spend:**

| Item | Cost | Notes |
|---|---|---|
| Anthropic API credits | **$50–$100** | Sonnet 4.6 at $3/$15 per 1M tokens. Budget for: ~200 synthetic-query generations during seeding (~$5), ~500 plan generations during testing (~$15), ~2000 chat messages during demo (~$30), buffer for re-runs. |
| OpenAI API credits | **$5** | Embeddings only. |
| Domain (optional) | **$12/yr** | If we want a vanity URL. |
| **Total required:** | **~$55–$115** | |

**Free this weekend (within free tiers):** Vercel, Convex Cloud, Mapbox, Sentry, Resend.

**Watch-outs:**
- Vercel Hobby blocks commercial use — flip to Pro ($20/mo) on handoff.
- Mapbox free tier is 50k tile loads/mo.
- **Set Anthropic usage alerts at $50, $100, $200 in the Anthropic console before any code runs.**

### 8.4 Estimated monthly run cost post-handoff

Assumes moderate traffic: 5k Navigator sessions/mo, 20k chat messages/mo, 50k map page views/mo, English only.

| Service | Monthly | Notes |
|---|---|---|
| Vercel Pro | $20 | |
| Convex Pro (Cloud path) | $25 + usage | OR ~$50/mo for self-hosted infra |
| Sentry Team | $26 | |
| Resend | $20 | 50k emails/mo |
| Mapbox | $0–$50 | Free under 50k loads |
| **Platform subtotal** | **~$90–$140** | |
| Anthropic API | **$200–$2000** | Variable. ~$0.05/chat message at typical lengths. |
| **Total estimated** | **$290–$2140** | |

**Adding Spanish:** Adds ~$5 in OpenAI re-embedding costs, plus Anthropic usage for synthetic-query regeneration (~$5 one-time). Translator labor (human or LLM-assisted) is the dominant cost there.

---

## 9. Production Concerns & How We Address Them

| Concern | Mitigation |
|---|---|
| Embedding latency on save | Convex action runs async after mutation. Admin UI shows `embeddingStatus` chip. |
| Failed embeddings | Convex actions retry with backoff. Failures surface in admin. |
| Anthropic API cost runaway | Hard daily cap enforced inside Convex actions via `budgetLedger`. Alerts at 50/80/100% of budget. Cache common queries in a `chatCache` table. |
| Chat abuse / scraping | Per-IP rate limit (20 req/min) + global daily cap via `@convex-dev/rate-limiter`. Cloudflare Turnstile on first message of a session. |
| Company self-service abuse | New submissions land in `pending`. Edits to claimed listings auto-publish but write a `diffLog` entry. Moderation queue in admin UI. |
| Magic link spoofing | Email matches the company's website domain. Single-use tokens with 15-min expiry. |
| **Section 508 / WCAG 2.1 AA** | **Intent UI on React Aria — strongest accessibility primitives in the React ecosystem (full keyboard nav, screen reader announcements, focus management). axe-core in CI. Manual keyboard nav check before demo.** |
| **Internationalization extensibility** | **Schema split (resources / resourceTranslations), locale routing, all UI strings via `next-intl`, AI prompts parameterized on locale, React Aria components locale-aware. Adding Spanish is content work, not engineering.** |
| Privacy | Chat conversations have a 30-day TTL via cron. Privacy notice in chat UI. PII fields from intake are *not* logged. |
| Backups / DR | Convex Cloud has automated backups. Self-hosted path uses Convex's built-in export to S3. |
| Observability | Sentry for errors. Convex's built-in dashboard for function metrics. Custom admin page for chat volume, top queries, weak retrievals, token spend. |
| Staging environment | Convex deployments per environment (`dev`, `prod`). |
| Secrets | Convex env vars (encrypted). Vercel env vars for frontend. 1Password vault. |
| CSP / security headers | Strict CSP, HSTS via `next.config.js` headers. |
| Vendor lock-in (Convex SaaS) | Self-host path documented and tested. Schema and functions are portable code. |

---

## 10. Parallel Workstreams

Seven workstreams designed to run in parallel after a 1-hour foundation block.

### Workstream A — Platform & Infra
**Owner:** _TBD_ • **Hours:** 0–6 heavy, then on-call

**Deliverables:**
1. Monorepo scaffolded with `apps/web` (Next.js 15 + Tailwind + Intent UI) and `convex/` directory
2. Convex project created, dev + prod deployments
3. Vercel project linked, custom domain configured, SSL working
4. Convex Auth configured with magic-link provider
5. **`next-intl` installed; `app/[locale]/...` routing working; middleware in place**
6. **`messages/en.json` and `messages/es.json` (stub) seeded**
7. **`<I18nProvider>` wrapping the app root for React Aria locale awareness**
8. **`docs/I18N.md` skeleton — how to add a locale**
9. Sentry project + DSN wired
10. Resend account + sender domain verified
11. `.env.example` with every variable documented (including locale defaults)
12. GitHub Actions CI: lint, typecheck, test, axe accessibility check, no-raw-strings check, `npx convex deploy` against dev
13. GitHub Actions CD: deploy to Vercel preview on PR, prod on main
14. Rate limiter component installed
15. Budget ledger schema + helper for AI spend caps
16. `infra/docker/Dockerfile.web` + `docker-compose.selfhost.yml`
17. `docs/HANDOFF.md` skeleton

**Done means:** A no-op PR deploys to a live URL, runs CI green, serves a `404` localized in English (and a placeholder if `/es/` is hit).

### Workstream B — Data Layer & AI Pipeline
**Owner:** _TBD_ • **Hours:** 1–10 heavy, then on-call

**Depends on:** A's scaffold (hour 2)

**Deliverables:**
1. `convex/schema.ts` complete (resources + **resourceTranslations** + companies + supporting tables, vector index on translations)
2. Tagging schema finalized
3. `data/seed/seed.ts` pulls from provided Google Sheets, **creates one `resources` row + one `resourceTranslations` row (locale='en') per record**
4. `convex/ai/embed.ts` — embedding helper
5. `convex/resources/actions.ts` — `generateSyntheticQueries` action (accepts `{ resourceId, locale }`)
6. `convex/resources/actions.ts` — `embedTranslation` action (operates on a translation row, not the resource)
7. Convex scheduler: on translation mutate, kick off the action chain
8. Initial seed run: all ~200 resources have an English translation row with synthetic queries + embeddings
9. `convex/chat/queries.ts` — vector search retrieval **filtered by locale**, with optional tag filter
10. Synthetic-query prompt iterated against 5 sample resources
11. `convex/ai/budget.ts` — daily cap helper

**Done means:** A query like "I need a microloan as a veteran in Weber County" returns the correct top-5 resources from the retrieval query, scoped to `en` translations.

### Workstream C — Navigator (Intake → Plan)
**Owner:** _TBD_ • **Hours:** 4–18

**Depends on:** B's data layer (hour 6)

**Deliverables:**
1. `/[locale]/navigator` landing with 4–5 entry-point cards, all strings via `useTranslations()`
2. Adaptive intake flow built on Intent UI's `Form`, `RadioGroup`, `ComboBox`, `Select`
3. `lib/personas.ts` — 6 spec personas
4. `convex/navigator/actions.ts` — `generatePlan` action, accepts `locale`, system prompt asks Claude to respond in that locale
5. `convex/ai/prompts/plan-generation.ts` — locale-parameterized
6. Plan rendering UI (Intent UI's `DisclosureGroup` or similar for sections)
7. Save/share — `/[locale]/plan/[shareSlug]` page, email-via-Resend integration
8. `tests/personas.test.ts` — runs all 6 personas, asserts distinct outputs
9. "Ask follow-up" handoff button preserves intake context + locale
10. `/[locale]/demo` page

**Done means:** All 6 personas produce distinct, useful plans in English; demo page is shareable; locale param is plumbed end-to-end.

### Workstream D — Resource Guide (AI Chat)
**Owner:** _TBD_ • **Hours:** 4–16

**Depends on:** B's retrieval (hour 6)

**Deliverables:**
1. `convex/chat/http.ts` — HTTP action streams Claude responses; accepts `locale`, filters retrieval by it
2. `convex/ai/prompts/chat-system.ts` — locale-parameterized
3. `/[locale]/chat` UI using Vercel AI SDK `useChat` + Intent UI primitives
4. Streaming response rendering with citation chips
5. Rate limiting (20 req/min per IP, global daily cap)
6. Response caching (`chatCache` table)
7. Conversation logging (`conversations` table, with `locale`)
8. "Was this helpful?" feedback widget
9. Budget alerts wired
10. Cost-cap fallback

**Done means:** Chat answers all 6 persona-style questions correctly with working citations in English; rate limiting blocks abuse; cost cap triggers a graceful fallback.

### Workstream E — Map & Self-Service
**Owner:** _TBD_ • **Hours:** 8–22

**Depends on:** B's companies schema (hour 6)

**Deliverables:**
1. `/[locale]/map` page with Mapbox GL JS, clustered markers
2. Filter sidebar built on Intent UI's `CheckboxGroup`, `ComboBox`, `Select`
3. `/[locale]/companies/[slug]` profile pages
4. Photo gallery rendering from Convex file storage
5. "Submit a company" form (Intent UI's `Form`, `TextField`, `NumberField`, `DropZone` for photos)
6. "Claim this listing" flow with magic link verification
7. Edit form for claimants with diff logging
8. Search by company name (Intent UI's `SearchField`)
9. Map performance tested with full company dataset

**Done means:** A user can submit, claim, and edit a listing; all moves are visible in the moderation queue.

### Workstream G — GOED Admin UI
**Owner:** _TBD_ • **Hours:** 6–22

**Depends on:** A's auth setup (hour 4) and B's collections (hour 6)

**Deliverables:**
1. `/[locale]/admin` shell with Convex Auth gate (allowlisted GOED emails only)
2. Resources table view (Intent UI's `Table`): search, filter by tag, embedding status
3. Resources create/edit form: title, slug, rich-text description, URL, tag picker (Intent UI's `TagGroup`), eligibility
4. **Per-locale tabs on the resource edit form**: "English" enabled, "Español" tab visible but disabled with tooltip "Spanish translations launching soon — see I18N.md to enable"
5. Resources delete (with confirmation `AlertDialog`)
6. Companies moderation queue (Intent UI's `Table` with row actions)
7. Companies edit form
8. Companies diff-log viewer (inline `Disclosure` per row)
9. Conversations read-only browser
10. Live status: synthetic-query regeneration progress on resource edits
11. Empty states, loading states, error states throughout
12. Mobile-responsive

**Done means:** A non-developer can: add a new resource, edit a description, approve a pending company, view recent chat conversations.

### Workstream F — Design, Copy, Polish, Demo
**Owner:** _TBD_ • **Hours:** 0–30 (cross-cutting)

**Deliverables:**
1. Design system tokens — Space Grotesk + DM Sans, JN Night palette, green accent
2. Intent UI component theme tuned to the palette
3. Landing page hero — investor-grade visual treatment
4. Real product copy throughout (no Lorem Ipsum) — populated in `messages/en.json`
5. Empty states, loading states, error states for every public surface
6. Mobile responsive pass
7. Accessibility audit: axe-core clean, manual keyboard nav, screen reader spot-check, **i18n smoke test (visit `/es/` confirm fallback messaging)**
8. `/demo` page with the 6 personas
9. `docs/DEMO_SCRIPT.md`
10. Demo rehearsal Sunday afternoon (record a backup video)
11. Social/share images (OG tags) per locale
12. Favicon, manifest

**Done means:** Site looks indistinguishable from a polished production product; demo flows in under 5 minutes; backup video exists.

### Cross-cutting checkpoints

- **Hour 2** — A integration: scaffold + i18n routing deployed, B can start
- **Hour 6** — B integration: data layer + retrieval working, C/D/E/G unblocked
- **Hour 14** — Sat night sync: Navigator and Chat working end-to-end with all 6 personas
- **Hour 22** — Sun morning: Map MVP, admin moderation queue functional
- **Hour 28** — Sun afternoon: full demo rehearsal with backup video

---

## 11. Hour-by-Hour Schedule

| Hour | A (Platform) | B (Data) | C (Navigator) | D (Chat) | E (Map) | G (Admin) | F (Design) |
|---|---|---|---|---|---|---|---|
| 0–1 | Repo + Convex + Intent UI | — | — | — | — | — | Tokens |
| 1–2 | next-intl + locale routing + scaffold deploy | Schema draft (i18n-aware) | — | — | — | — | Hero copy |
| 2–4 | CI/CD + Auth + Docker | Schema + seed (en translation rows) | Persona fixtures | — | — | Admin shell + auth gate | Landing |
| 4–6 | Rate limit + budget | Embeddings on translation rows | Intake flow | Chat HTTP stub | — | Resources table | Components |
| 6–10 | On-call | Locale-filtered retrieval tested | Plan gen + UI | Chat UI + streaming | Mapbox setup | Resources CRUD form + locale tabs | Real copy in en.json |
| 10–14 | Observability | Quality tuning | Demo page + tests | Citations + caching | Profile pages | Companies queue | Polish, error states |
| 14–16 | **Sleep / sync** | | | | | | |
| 16–22 | Self-host Docker docs | On-call | Polish | Logging + feedback | Claim flow | Conversations viewer + diff log | Mobile + a11y + i18n smoke test |
| 22–26 | Backups + handoff doc + I18N.md | On-call | Final tests | Cost monitoring | Filters + search | Polish admin | Demo script |
| 26–30 | Final deploy | | | | | | Rehearsal + backup video |

---

## 12. Demo Plan (5-minute pitch)

Detailed in `docs/DEMO_SCRIPT.md`. Outline:

1. **0:00–0:30** — Open with the problem.
2. **0:30–2:00** — **Live persona walkthrough** on `/demo`. Click "Maria, rural agricultural founder." Show the personalized plan generated in real time. Click "Ask a follow-up question." Show chat answering with citations.
3. **2:00–3:00** — **The reactive CMS magic moment.** Open `/admin` in another tab. Edit a resource description. *Without refreshing*, watch the chat answer in the first tab update in real time as the embedding completes. *"This is what 'easily updatable' looks like."*
4. **3:00–3:45** — **The Map.** Show clustered markers, filter to rural manufacturing companies hiring now. Click a profile. Click "Claim this listing." Show magic link arrival.
5. **3:45–4:15** — **The Map handoff.** Show the Docker compose file, the self-hosted Convex stack, the observability dashboard. Two paths — Convex Cloud at $25/mo or fully self-hosted on your AWS.
6. **4:15–4:45** — **Future-proof for Utah's communities.** Briefly: "We architected for Spanish from day one. Translator adds copy, GOED ships it. Schema, routing, AI prompts, accessibility — all locale-aware now."
7. **4:45–5:00** — Close with cost transparency.

The reactive demo moment in step 3 is the differentiator. The i18n callout in step 6 wins the "did they think about Utah's actual communities?" judging consideration.

---

## 13. Handoff Plan

`docs/HANDOFF.md` contents (drafted Sunday):

1. **What was built** — link to live demo, source code, this plan
2. **How to run it locally** — clone, env setup, `pnpm install`, `pnpm dev`, `npx convex dev`
3. **How to deploy — Cloud path** — transfer Convex project, deploy Vercel, ~20 minutes
4. **How to deploy — self-host path** — `docker-compose up`, environment config
5. **How to administer content** — Admin UI walkthrough with screenshots
6. **How to add a GOED admin user** — Allowlist email in Convex env, sign in via magic link
7. **How to monitor costs** — Anthropic console, Convex dashboard, budget ledger view
8. **How to back up and restore** — Convex's built-in export tooling
9. **How to update the AI prompts** — file locations, version-tag convention
10. **How to add new tag dimensions** — schema migration walkthrough
11. **How to enable Spanish (or any new locale)** — pointer to `docs/I18N.md`
12. **Migration off Convex (worst case)** — schemas are vanilla TS objects; data export is JSON
13. **Known limitations and "what we'd build next"** — honest, with priorities
14. **Contacts** — team emails for transition Q&A window

`docs/I18N.md` walkthrough:
1. Add the locale code to `apps/web/app/i18n/routing.ts`
2. Translate `messages/<locale>.json` (one file, ICU format)
3. For each resource in the catalog, add a `resourceTranslations` row via the admin UI (or bulk via a script we provide)
4. Run `npx convex run resources:embedAllForLocale --locale=<code>` to generate embeddings
5. Enable the locale in the public locale switcher
6. Done — no code changes, no redeploy

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Anthropic API rate-limited or down during demo | Low | High | Cache last persona runs in `chatCache`; fallback to cached responses. |
| Convex free tier exhausted | Low | Medium | Demo with warm queries first; upgrade to Pro ($25) if at risk. |
| Vercel deploy fails Sunday | Low | High | Backup video recorded by hour 28. Local dev mirror ready. |
| Synthetic queries are bad quality | Medium | Medium | Manual review of 5 samples Saturday morning, iterate prompt before bulk seed. |
| Map performance with full dataset | Medium | Low | Cluster aggressively; lazy-load profile data. |
| Magic link domain check fails for legit users | Medium | Medium | Fall back to "request manual verification" form. |
| Team member loses ~6 hours sleeping | High | Medium | Workstreams designed independent. |
| Judges don't read the reactive admin moment | Medium | High | Demo step 3 makes it impossible to miss. |
| GOED procurement balks at Convex SaaS | Medium | Medium | Self-host path documented and tested before demo. |
| **Intent UI ramp-up time** | **Medium** | **Medium** | **API is similar to shadcn/Radix; Workstream F builds component wrappers early so other tracks can copy patterns.** |
| **i18n scaffolding eats time we needed for polish** | **Medium** | **Medium** | **Hard cap: en + es-stub only. Don't actually translate anything. The seam matters more than the second locale.** |
| Custom admin UI under-polished | Medium | High | Workstream G is its own track with hard scope cap: resources CRUD, companies moderation, conversations read-only. Locale tabs are a single disabled `Tab` element, not a translation editor. |

---

## 15. Appendices

### 15.1 Environment variables (`.env.example`)

```
# Convex (frontend)
NEXT_PUBLIC_CONVEX_URL=
NEXT_PUBLIC_CONVEX_SITE_URL=

# Convex (backend, set via `npx convex env set`)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_DAILY_BUDGET_USD=50
RESEND_API_KEY=
EMAIL_FROM="Startup State <noreply@...>"
GOED_ADMIN_ALLOWLIST=ji.park@example.com,...

# Frontend env
NEXT_PUBLIC_MAPBOX_TOKEN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=

# i18n
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_SUPPORTED_LOCALES=en           # add 'es' when Spanish launches

# Feature flags
ENABLE_CHAT=true
CHAT_RATE_LIMIT_PER_MINUTE=20
ENABLE_CROSS_LOCALE_FALLBACK=false         # if true, en results show for non-en queries when no matches
```

### 15.2 Synthetic query generation prompt (v1 draft)

Lives in `convex/ai/prompts/synthetic-queries.ts`. Accepts `{ resource, locale }`.

> You are helping Utah founders find the right state resource. Below is a description of one program. **Generate the questions in {{locale}}** — use natural language a founder would actually type or say.
>
> Generate 10 questions a real founder might ask in their own words that this program would answer. Vary phrasing, urgency level, and specificity. Use natural founder language — not government language. Cover questions about eligibility, the problem being solved, life situations, and adjacent concerns. Some specific, some vague.
>
> Return a JSON array of strings.

### 15.3 Chat system prompt skeleton (v1 draft)

> You are the Utah Startup State Resource Guide. You help founders find the right state programs, capital, mentorship, and education resources for their specific situation. **Respond in {{locale}}.**
>
> **Rules:**
> 1. Every recommendation must cite a specific resource from the context provided. Use this format: `[Resource Name](url)`.
> 2. If no resource in the context matches the user's question, say so plainly. Suggest the closest adjacent resource and recommend the user contact GOED directly. Do not invent programs.
> 3. If user intake context is provided (location, stage, demographic), tailor your answer.
> 4. Use plain, direct language. Founders are busy. Skip preambles.
>
> **Context (top retrieved resources, locale-filtered):** {{resources}}
>
> **User intake (if any):** {{intake}}

### 15.4 Persona test fixtures

```ts
export const personas = [
  { id: 'jordan', name: 'Jordan, 20', location: 'Salt Lake City', stage: 'idea', industry: null, demographic: ['young'], blocker: 'I have an idea but no business yet', locale: 'en' },
  { id: 'maria', name: 'Maria, 38', location: 'Washington County', stage: 'early', industry: 'agriculture', demographic: ['women','rural'], blocker: 'Looking to scale my small agricultural operation', locale: 'en' },
  { id: 'marcus', name: 'Marcus, 34', location: 'Weber County', stage: 'early', industry: 'manufacturing', demographic: ['veteran'], blocker: 'Starting a custom fabrication business after leaving the military', locale: 'en' },
  { id: 'priya', name: 'Priya, 31', location: 'Salt Lake City', stage: 'growth', industry: 'b2b-saas', demographic: [], blocker: 'Ready to raise my first venture round', locale: 'en' },
  { id: 'david', name: 'David, 45', location: 'Utah County', stage: 'scaling', industry: 'medical-devices', demographic: [], blocker: 'FDA cleared, looking to expand to international markets', locale: 'en' },
  { id: 'amir', name: 'Dr. Amir, 29', location: 'Salt Lake City', stage: 'idea', industry: 'deep-tech', demographic: ['academic'], blocker: 'PhD candidate wanting to commercialize my research', locale: 'en' },
];
```

### 15.5 Pre-flight checklist (before code starts)

- [ ] Anthropic account with $100 credit, daily budget alert set at $50
- [ ] OpenAI account with $5 credit
- [ ] Vercel account, team created, GitHub connected
- [ ] Convex account, project created, dev + prod deployments
- [ ] Resend account, sender domain verified
- [ ] Sentry account, project created
- [ ] Mapbox account, public token created
- [ ] GitHub repo created, all team members invited
- [ ] 1Password vault shared with team, all secrets stored
- [ ] Domain purchased (optional)
- [ ] Provided Google Sheets exported to CSV in `data/seed/`
- [ ] Intent UI docs bookmarked (intentui.com)

---

**This plan is a working document. Update it as decisions change. Every workstream owner is responsible for keeping their section accurate.**
