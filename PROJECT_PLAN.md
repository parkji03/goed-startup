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
│  │ Public Surfaces                                        │  │
│  │   /                  Landing                           │  │
│  │   /navigator         Intake flow → plan                │  │
│  │   /chat              Resource Guide (AI)               │  │
│  │   /map               Utah Startup Map                  │  │
│  │   /companies/[slug]  Company profile                   │  │
│  │   /demo              Persona walkthroughs (judges)     │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ Authenticated Surfaces                                 │  │
│  │   /admin             GOED staff CMS                    │  │
│  │   /admin/resources   CRUD + tag editor                 │  │
│  │   /admin/companies   Moderation queue                  │  │
│  │   /admin/conversations  Quality review                 │  │
│  │   /claim/[token]     Company-claim landing             │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Next.js Route Handlers (the only server endpoints)     │  │
│  │   /api/chat            Streaming chat (calls Convex)   │  │
│  │   /api/navigator/plan  Plan generation                 │  │
│  │   All other reads/writes go through Convex client      │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────┬────────────────────────────────────┘
                          │ Convex client (typed RPC + reactive)
                          │
┌─────────────────────────▼────────────────────────────────────┐
│                          Convex                              │
│  Tables (with vector indexes where noted)                    │
│   resources    [vectorIndex on `embedding`]                  │
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
│   embedResource, generateSyntheticQueries, expirePlans       │
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
- Convex is the only backend. Next.js is mostly a rendering and routing layer.
- Reactive queries everywhere — admin edits show up live in chat answers without manual refresh.
- File storage uses Convex's built-in (no separate R2/S3 to provision).
- All AI calls go through Convex actions so we have one place to enforce rate limits and budget caps.

---

## 4. Technology Stack (Locked)

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | RSC, route handlers, deployable to Vercel and Docker equivalently |
| UI | Tailwind + shadcn/ui (Radix) | Production-quality components, accessibility built in |
| Backend / DB | **Convex** | Reactive DB, built-in vector search, file storage, jobs, auth, rate limit |
| Admin UI | Custom — shadcn/ui + Convex queries | Replaces Payload's batteries-included admin |
| Auth | Convex Auth (magic link) | Same primitive for GOED staff and company claimants |
| AI orchestration | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) | Streaming + `useChat`; called from Convex HTTP actions |
| LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) | Best balance of quality, latency, cost |
| Embeddings | OpenAI `text-embedding-3-small` (1536-dim) | Cheap, well-supported by Convex vector index |
| Vector search | Convex `vectorIndex` | No pgvector to provision |
| Rate limiting | Convex `@convex-dev/rate-limiter` | First-party component |
| Cache (chat responses) | Convex tables with TTL via cron | No separate Redis |
| Maps | Mapbox GL JS | Generous free tier, polished default styling |
| Email | Resend | Magic links + plan-share emails |
| Observability | Sentry + Vercel Analytics + Convex's built-in dashboard | Errors, traffic, function metrics |
| CI/CD | GitHub Actions | Standard, portable |
| Container runtime (handoff) | Docker (Next.js + self-hosted Convex) | Decouples deployment from Vercel and Convex Cloud |

**Explicit rejections:**
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
│       │   ├── (public)/
│       │   │   ├── page.tsx          # Landing
│       │   │   ├── navigator/
│       │   │   ├── chat/
│       │   │   ├── map/
│       │   │   ├── companies/[slug]/
│       │   │   └── demo/
│       │   ├── (admin)/admin/        # GOED staff CMS
│       │   │   ├── layout.tsx        # Auth gate
│       │   │   ├── resources/
│       │   │   ├── companies/
│       │   │   └── conversations/
│       │   ├── claim/[token]/        # Company claim landing
│       │   └── api/
│       │       ├── chat/route.ts     # Streams from Convex HTTP action
│       │       └── navigator/plan/route.ts
│       ├── components/
│       │   ├── navigator/
│       │   ├── chat/
│       │   ├── map/
│       │   ├── admin/                # CRUD tables, forms, moderation queue
│       │   └── ui/                   # shadcn primitives
│       ├── lib/
│       │   ├── personas.ts           # 6 spec personas as test fixtures
│       │   └── convex.ts             # Convex client setup
│       └── tests/
│           ├── personas.test.ts      # plan generation acceptance tests
│           └── retrieval.test.ts
├── convex/                           # Convex backend
│   ├── schema.ts                     # All tables + indexes
│   ├── auth.config.ts                # Magic link config
│   ├── auth.ts                       # Auth helpers
│   ├── resources/
│   │   ├── queries.ts                # list, byId, search
│   │   ├── mutations.ts              # create, update, delete
│   │   └── actions.ts                # generateSyntheticQueries, embed
│   ├── companies/
│   │   ├── queries.ts
│   │   ├── mutations.ts              # submit, claim, edit
│   │   └── actions.ts                # sendClaimMagicLink, verifyClaim
│   ├── chat/
│   │   ├── queries.ts                # retrieveContext (vector search)
│   │   └── http.ts                   # streaming chat HTTP action
│   ├── navigator/
│   │   └── actions.ts                # generatePlan
│   ├── conversations/
│   │   ├── mutations.ts
│   │   └── queries.ts
│   ├── crons.ts                      # scheduled tasks
│   ├── ai/
│   │   ├── claude.ts
│   │   ├── embed.ts
│   │   ├── budget.ts                 # daily cap enforcement
│   │   └── prompts/
│   │       ├── synthetic-queries.ts
│   │       ├── plan-generation.ts
│   │       └── chat-system.ts
│   └── _generated/                   # Convex codegen (gitignored)
├── data/
│   ├── seed/
│   │   ├── resources.csv             # exported from provided sheet
│   │   ├── companies.csv
│   │   └── seed.ts                   # one-shot import script (uses Convex client)
│   └── README.md
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.web            # Next.js container
│   │   └── docker-compose.selfhost.yml  # Self-hosted Convex stack for handoff
│   └── README.md                     # Handoff runbook
├── docs/
│   ├── HANDOFF.md                    # For GOED's team — both Convex Cloud and self-host paths
│   ├── DEMO_SCRIPT.md
│   ├── ACCESSIBILITY.md
│   └── PROMPT_ENGINEERING.md
├── .github/workflows/
│   ├── ci.yml
│   └── deploy.yml
├── .env.example
├── PROJECT_PLAN.md                   # this file
└── README.md
```

---

## 6. Data Model (Convex Schema)

`convex/schema.ts` — abbreviated.

```ts
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  resources: defineTable({
    title: v.string(),
    slug: v.string(),
    description: v.string(),                // markdown
    url: v.string(),                        // citation source
    tags: v.object({
      stage: v.array(v.string()),
      industry: v.array(v.string()),
      geography: v.array(v.string()),
      counties: v.array(v.string()),
      demographic: v.array(v.string()),
      resourceType: v.array(v.string()),
    }),
    eligibility: v.optional(v.string()),
    syntheticQueries: v.optional(v.array(v.string())),  // auto-populated
    embedding: v.optional(v.array(v.float64())),         // 1536-dim
    embeddingUpdatedAt: v.optional(v.number()),
    embeddingStatus: v.union(
      v.literal('pending'), v.literal('ready'), v.literal('failed')
    ),
  })
    .index('by_slug', ['slug'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['tags.stage', 'tags.demographic', 'tags.counties'],
    }),

  companies: defineTable({
    name: v.string(),
    slug: v.string(),
    website: v.string(),                    // domain used for claim verification
    description: v.string(),
    sector: v.string(),
    stage: v.string(),
    employeeCount: v.string(),              // ranges, not exact
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
    photos: v.array(v.id('_storage')),       // Convex file storage refs
    status: v.union(
      v.literal('pending'), v.literal('published'), v.literal('archived')
    ),
    claimedBy: v.optional(v.id('users')),
    lastEditedAt: v.number(),
    diffLog: v.array(v.object({
      userId: v.optional(v.id('users')),
      timestamp: v.number(),
      changes: v.string(),                   // JSON-encoded diff
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
  }).index('by_email', ['email']),

  claimTokens: defineTable({
    token: v.string(),                       // unguessable
    companyId: v.id('companies'),
    email: v.string(),
    expiresAt: v.number(),                   // 15-min TTL
    consumedAt: v.optional(v.number()),
  }).index('by_token', ['token']),

  conversations: defineTable({
    sessionId: v.string(),
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
    expiresAt: v.number(),                   // 30-day default
  }).index('by_session', ['sessionId']),

  plans: defineTable({
    shareSlug: v.string(),
    intake: v.any(),
    generatedPlan: v.string(),               // markdown
    recommendedResources: v.array(v.id('resources')),
    emailedTo: v.optional(v.string()),
    expiresAt: v.number(),                   // 90-day default
  }).index('by_slug', ['shareSlug']),

  budgetLedger: defineTable({
    day: v.string(),                         // YYYY-MM-DD
    spendUsd: v.number(),
    callsCount: v.number(),
  }).index('by_day', ['day']),
});
```

**Reactivity contract:** any mutation to `resources` triggers re-execution of dependent queries (admin tables, chat retrieval). The chat UI subscribed to `conversations` automatically receives new messages. This is what makes the "edit a resource, watch the answer update" demo moment work.

**Vector search:** Convex's `vectorIndex` supports filter fields, so the Navigator and Chat retrieval do tag-filter + similarity in one query — no pgvector SQL needed.

---

## 7. Deployment & Infrastructure

### 7.1 Demo-weekend deployment

| Service | Tier | Purpose |
|---|---|---|
| Vercel | Hobby (free) → Pro if needed | Hosts Next.js (frontend + admin UI) |
| Convex Cloud | Free tier (1M function calls, 100MB storage, 5GB bandwidth) | Backend, DB, vector search, file storage, jobs |
| Cloudflare DNS | Free | Domain + SSL |
| Sentry | Developer (free, 5k events) | Errors |
| Resend | Free (100 emails/day) | Magic links |
| Mapbox | Free tier (50k loads/mo) | Map tiles |

The Convex free tier covers the entire weekend. No Postgres, no Redis, no S3 to set up.

### 7.2 Handoff target (documented for GOED)

Two paths, both documented:

**Path A — Convex Cloud (recommended).** GOED creates their own Convex team, we transfer the project. Convex Pro is $25/team/mo + usage. This is the lowest-effort handoff.

**Path B — Self-hosted Convex.** Convex's backend is open-source and runs in Docker. `infra/docker/docker-compose.selfhost.yml` describes the full stack (Convex + Next.js + Postgres for Convex's underlying storage). This deploys to AWS ECS, Azure Container Apps, or any Kubernetes cluster.

The handoff runbook walks GOED through both options. They can choose based on their procurement and infrastructure constraints.

### 7.3 Cost breakdown — what we spend this weekend

**Required spend (must purchase before Saturday):**

| Item | Cost | Notes |
|---|---|---|
| Anthropic API credits | **$50–$100** | Sonnet 4.6 at $3/$15 per 1M tokens. Budget for: ~200 synthetic-query generations during seeding (~$5), ~500 plan generations during testing (~$15), ~2000 chat messages during demo (~$30), buffer for re-runs. |
| OpenAI API credits | **$5** | Embeddings only, `text-embedding-3-small` at $0.02 / 1M tokens. |
| Domain (optional) | **$12/yr** | If we want a vanity URL like `startupstate.app`. Skip if using a subdomain GOED provides. |
| **Total required:** | **~$55–$115** | |

**Free this weekend (within free tiers):**
- Vercel, Convex Cloud, Mapbox, Sentry, Resend

**Watch-outs that could trigger paid upgrades:**
- Vercel Hobby blocks commercial use — for hackathon submission it's fine; flip to Pro ($20/mo) on handoff.
- Convex free tier auto-suspends if exceeded; very unlikely to hit during demo. Pro is $25/mo.
- Mapbox free tier is 50k tile loads/mo. Demo day shouldn't exceed it.
- **Set Anthropic usage alerts at $50, $100, $200 in the Anthropic console before any code runs.**

### 7.4 Estimated monthly run cost post-handoff

Assumes moderate traffic: 5k Navigator sessions/mo, 20k chat messages/mo, 50k map page views/mo.

| Service | Monthly | Notes |
|---|---|---|
| Vercel Pro | $20 | |
| Convex Pro (Cloud path) | $25 + usage | OR ~$50/mo for self-hosted infra (smaller AWS instance + Postgres) |
| Sentry Team | $26 | |
| Resend | $20 | 50k emails/mo |
| Mapbox | $0–$50 | Free under 50k loads |
| **Platform subtotal** | **~$90–$140** | Cheaper than the Postgres+Redis+jobs option |
| Anthropic API | **$200–$2000** | Variable. ~$0.05/chat message at typical lengths. |
| **Total estimated** | **$290–$2140** | |

Convex actually saves ~$25/mo vs the Postgres+Redis stack at this scale because we're not paying for two managed services.

---

## 8. Production Concerns & How We Address Them

| Concern | Mitigation |
|---|---|
| Embedding latency on save | Convex action runs async after mutation. Admin UI shows `embeddingStatus` chip (`pending` → `ready`). |
| Failed embeddings | Convex actions retry with backoff. Failures surface via `embeddingStatus: 'failed'` in admin. |
| Anthropic API cost runaway | Hard daily cap enforced inside the Convex action via `budgetLedger` table. Alerts at 50/80/100% of budget. Cache common queries in a `chatCache` table with cron-expired TTL. |
| Chat abuse / scraping | Per-IP rate limit (20 req/min) + global daily cap via `@convex-dev/rate-limiter`. Cloudflare Turnstile on first message of a session. |
| Company self-service abuse | New submissions land in `pending`. Edits to claimed listings auto-publish but write a `diffLog` entry. Moderation queue in admin UI. |
| Magic link spoofing | Verify email matches the company's website domain. Single-use tokens with 15-min expiry stored in `claimTokens`. |
| Section 508 / WCAG 2.1 AA | shadcn/ui (Radix primitives accessible by default). axe-core in CI. Manual keyboard nav check before demo. |
| Privacy | Chat conversations have a 30-day TTL via cron. Privacy notice in chat UI. PII fields from intake are *not* logged. Retention configurable via env. |
| Backups / DR | Convex Cloud has automated backups. Self-hosted path uses Convex's built-in export to S3. Documented restore procedure. |
| Observability | Sentry for errors. Convex's built-in dashboard for function metrics. Custom admin page showing chat volume, top queries, weak retrievals, token spend. |
| Staging environment | Convex deployments per environment (`dev`, `prod`). GOED previews changes against `dev` before promoting. |
| Secrets | Convex env vars (encrypted) for backend secrets. Vercel env vars for frontend. 1Password vault for the team. |
| CSP / security headers | Strict CSP, HSTS via `next.config.js` headers. |
| Vendor lock-in (Convex SaaS) | **Self-host path documented and tested.** Schema and functions are portable code. Data export tooling is built-in. |

---

## 9. Parallel Workstreams

Six workstreams designed to run in parallel after a 1-hour foundation block. Owners TBD — assign by team strength.

Dependencies are minimal: A produces the scaffold by hour 2, then B/C/D/E/F all run independently with periodic integration checkpoints.

### Workstream A — Platform & Infra
**Owner:** _TBD_ • **Hours:** 0–6 heavy, then on-call

**Deliverables:**
1. Monorepo scaffolded with `apps/web` (Next.js 15 + Tailwind + shadcn) and `convex/` directory
2. Convex project created, dev + prod deployments set up
3. Vercel project linked, custom domain configured, SSL working
4. Convex Auth configured with magic-link provider
5. Sentry project + DSN wired
6. Resend account + sender domain verified
7. `.env.example` with every variable documented
8. GitHub Actions CI: lint, typecheck, test, axe accessibility check, `npx convex deploy` against dev
9. GitHub Actions CD: deploy to Vercel preview on PR, prod on main
10. Rate limiter component installed (`@convex-dev/rate-limiter`)
11. Budget ledger schema + helper for AI spend caps
12. `infra/docker/Dockerfile.web` for self-hosted Next.js
13. `infra/docker/docker-compose.selfhost.yml` for self-hosted Convex stack
14. `docs/HANDOFF.md` skeleton with both Cloud and self-host paths

**Done means:** A no-op PR deploys to a live URL, runs CI green, and a `404` page is served at the production domain.

### Workstream B — Data Layer & AI Pipeline
**Owner:** _TBD_ • **Hours:** 1–10 heavy, then on-call

**Depends on:** A's scaffold (hour 2)

**Deliverables:**
1. `convex/schema.ts` complete (all 6+ tables, vector index on resources)
2. Tagging schema finalized (stage, industry, geography, counties, demographic, resourceType)
3. `data/seed/seed.ts` pulls from provided Google Sheets and loads into Convex via the client
4. `convex/ai/embed.ts` — embedding helper (OpenAI `text-embedding-3-small`)
5. `convex/resources/actions.ts` — `generateSyntheticQueries` action (Claude generates 8–12 founder questions)
6. `convex/resources/actions.ts` — `embedResource` action (combines title + description + synthetic queries → embedding)
7. Convex scheduler: on resource mutate, kick off the action chain
8. Initial seed run completed: all ~200 resources have synthetic queries + embeddings
9. `convex/chat/queries.ts` — vector search retrieval with optional tag filter
10. Synthetic-query prompt iterated against 5 sample resources for quality
11. `convex/ai/prompts/synthetic-queries.ts` documented and version-tagged
12. `convex/ai/budget.ts` — daily cap helper used by all AI actions

**Done means:** A query like "I need a microloan as a veteran in Weber County" returns the correct top-5 resources from the retrieval query.

### Workstream C — Navigator (Intake → Plan)
**Owner:** _TBD_ • **Hours:** 4–18

**Depends on:** B's data layer (hour 6)

**Deliverables:**
1. `/navigator` landing with 4–5 entry-point cards
2. Adaptive intake flow (3–5 branching questions, client state)
3. `lib/personas.ts` — 6 spec personas as JSON fixtures
4. `convex/navigator/actions.ts` — `generatePlan` action (uses Claude with retrieved resources)
5. `convex/ai/prompts/plan-generation.ts` — system prompt with citation requirements
6. Plan rendering UI: prioritized actions, qualifying programs, contacts
7. Save/share — `/plan/[shareSlug]` page, email-via-Resend integration
8. `tests/personas.test.ts` — runs all 6 personas through plan generation, asserts distinct outputs
9. "Ask follow-up" handoff button that opens `/chat` with intake context preserved in session
10. `/demo` page that one-click-runs each persona for judges

**Done means:** All 6 personas produce distinct, useful plans; demo page is shareable.

### Workstream D — Resource Guide (AI Chat)
**Owner:** _TBD_ • **Hours:** 4–16

**Depends on:** B's retrieval (hour 6)

**Deliverables:**
1. `convex/chat/http.ts` — HTTP action streams Claude responses with retrieved context
2. `convex/ai/prompts/chat-system.ts` — system prompt enforcing citations and refusal-when-no-match
3. `/chat` UI using Vercel AI SDK `useChat` hooked into the Convex HTTP endpoint
4. Streaming response rendering with citation chips that link to source pages
5. Rate limiting via `@convex-dev/rate-limiter` (20 req/min per IP, global daily cap)
6. Response caching via `chatCache` table keyed on normalized query + intake context
7. Conversation logging to `conversations` table (anonymized)
8. "Was this helpful?" feedback widget writing to conversations
9. Budget alerts wired (Anthropic spend monitoring via `budgetLedger`)
10. Cost-cap fallback: if daily cap hit, serve cached answers + clear "high traffic" message

**Done means:** Chat answers all 6 persona-style questions correctly with working citations; rate limiting demonstrably blocks abuse; cost cap triggers a graceful fallback.

### Workstream E — Map & Self-Service
**Owner:** _TBD_ • **Hours:** 8–22

**Depends on:** B's companies schema (hour 6)

**Deliverables:**
1. `/map` page with Mapbox GL JS, clustered company markers
2. Filter sidebar: sector, stage, size, hiring status, county
3. `/companies/[slug]` profile pages with all required fields
4. Photo gallery rendering from Convex file storage
5. "Submit a company" public form (lands as `pending`)
6. "Claim this listing" flow:
   - Email entered, system checks domain matches `company.website`
   - Magic link via Resend with 15-min single-use token in `claimTokens`
   - Token redeems to a Convex Auth session that allows editing the claimed company
7. Edit form for claimants with diff logging into `companies.diffLog`
8. Search by company name
9. Map performance tested with full company dataset

**Done means:** A user can submit a company, claim an existing listing via magic link, and edit it; all moves are visible in the moderation queue (Workstream G).

### Workstream G — GOED Admin UI
**Owner:** _TBD_ • **Hours:** 6–22

**Depends on:** A's auth setup (hour 4) and B's collections (hour 6)

This is the deliverable that proves "easily updatable without a developer." Without Payload, we build it.

**Deliverables:**
1. `/admin` shell with Convex Auth gate (allowlisted GOED emails only)
2. Resources table view: search, filter by tag, status of embedding (`pending`/`ready`/`failed`)
3. Resources create/edit form: title, slug, rich-text description, URL, tag picker, eligibility
4. Resources delete (with confirmation)
5. Companies moderation queue: pending submissions surfaced first, approve/reject inline
6. Companies edit form: same as Workstream E's claim form, plus admin-only fields
7. Companies diff-log viewer (inline expand on each row)
8. Conversations read-only browser: recent sessions, weak-retrieval flag, feedback display
9. Live status: when staff edit a resource, show synthetic-query regeneration progress
10. Empty states, loading states, error states throughout
11. Mobile-responsive (state staff may edit from phones during travel)

**Done means:** A non-developer can: add a new resource, edit a description, approve a pending company, view recent chat conversations — all without touching code or the Convex dashboard.

### Workstream F — Design, Copy, Polish, Demo
**Owner:** _TBD_ • **Hours:** 0–30 (cross-cutting)

**Deliverables:**
1. Design system tokens — Space Grotesk + DM Sans, JN Night palette from spec page, green accent
2. Landing page hero — investor-grade visual treatment
3. Real product copy throughout (no Lorem Ipsum, no placeholder buttons)
4. Empty states, loading states, error states for every public surface
5. Mobile responsive pass on all surfaces
6. Accessibility audit: axe-core clean, manual keyboard nav, screen reader spot-check
7. `/demo` page with the 6 personas, big buttons, judge-friendly
8. `docs/DEMO_SCRIPT.md` — exact 5-minute pitch with timings
9. Demo rehearsal Sunday afternoon (record a backup video in case live demo fails)
10. Social/share images (OG tags) for the public site
11. Favicon, manifest, basic PWA niceties

**Done means:** Site looks indistinguishable from a polished production product; demo flows in under 5 minutes; backup video exists.

### Cross-cutting checkpoints

- **Hour 2** — A integration: scaffold deployed, B can start building on it
- **Hour 6** — B integration: data layer + retrieval working, C/D/E/G unblocked
- **Hour 14** — Sat night sync: Navigator and Chat working end-to-end with all 6 personas
- **Hour 22** — Sun morning: Map MVP working, admin moderation queue functional
- **Hour 28** — Sun afternoon: full demo rehearsal with backup video

---

## 10. Hour-by-Hour Schedule

Numbers are hours into the hackathon. Adjust to actual start time.

| Hour | A (Platform) | B (Data) | C (Navigator) | D (Chat) | E (Map) | G (Admin) | F (Design) |
|---|---|---|---|---|---|---|---|
| 0–1 | Repo + Convex | — | — | — | — | — | Tokens |
| 1–2 | Scaffold + deploy | Schema draft | — | — | — | — | Hero copy |
| 2–4 | CI/CD + Auth + Docker | Schema + seed | Persona fixtures | — | — | Admin shell + auth gate | Landing |
| 4–6 | Rate limit + budget | Embeddings + queries | Intake flow | Chat HTTP stub | — | Resources table | Components |
| 6–10 | On-call | Retrieval tested | Plan gen + UI | Chat UI + streaming | Mapbox setup | Resources CRUD form | Real copy |
| 10–14 | Observability | Quality tuning | Demo page + tests | Citations + caching | Profile pages | Companies queue | Polish, error states |
| 14–16 | **Sleep / sync** | | | | | | |
| 16–22 | Self-host Docker docs | On-call | Polish | Logging + feedback | Claim flow | Conversations viewer + diff log | Mobile + a11y |
| 22–26 | Backups + handoff doc | On-call | Final tests | Cost monitoring | Filters + search | Polish admin | Demo script |
| 26–30 | Final deploy | | | | | | Rehearsal + backup video |

---

## 11. Demo Plan (5-minute pitch)

Detailed in `docs/DEMO_SCRIPT.md`. Outline:

1. **0:00–0:30** — Open with the problem, named: "Utah's resources are world-class. Discovery is broken. Two products fix that."
2. **0:30–2:00** — **Live persona walkthrough** on `/demo`. Click "Maria, rural agricultural founder." Show the personalized plan generated in real time. Click "Ask a follow-up question." Show chat answering with citations.
3. **2:00–3:00** — **The reactive CMS magic moment.** Open `/admin` in another tab. Edit a resource description. *Without refreshing*, watch the chat answer in the first tab update in real time as the embedding completes. *"This is what 'easily updatable' looks like — not a deploy, not a refresh, just live."*
4. **3:00–3:45** — **The Map.** Show clustered markers, filter to rural manufacturing companies hiring now. Click a profile. Click "Claim this listing." Show magic link arrival.
5. **3:45–4:30** — **The handoff.** Show the Docker compose file, the self-hosted Convex stack, the observability dashboard. *"What happens when our team goes home? You run this. Two paths — Convex Cloud at $25/mo or fully self-hosted on your AWS. Here's the runbook for both."*
6. **4:30–5:00** — Close with cost transparency: "$90–$140/mo platform, variable AI spend with hard caps. Budget alerts already wired. We've already burned $X this weekend, here's the receipt."

The reactive demo moment in step 3 is the differentiator. Other teams will demo working products. We demo a product where staff edits propagate to AI answers without a refresh — proving to GOED that this is a system they can actually operate.

---

## 12. Handoff Plan

`docs/HANDOFF.md` contents (drafted Sunday):

1. **What was built** — link to live demo, source code, this plan
2. **How to run it locally** — clone, env setup, `pnpm install`, `pnpm dev`, `npx convex dev`
3. **How to deploy — Cloud path** — transfer Convex project, deploy Vercel, ~20 minutes
4. **How to deploy — self-host path** — `docker-compose up`, environment config, ~half day for someone familiar with Docker
5. **How to administer content** — Admin UI walkthrough with screenshots
6. **How to add a GOED admin user** — Allowlist email in Convex env, sign in via magic link
7. **How to monitor costs** — Anthropic console, Convex dashboard, budget ledger view in admin
8. **How to back up and restore** — Convex's built-in export tooling, scheduled exports to S3
9. **How to update the AI prompts** — file locations, version-tag convention, deploy via `npx convex deploy`
10. **How to add new tag dimensions** — schema migration walkthrough
11. **Migration off Convex (worst case)** — schemas are vanilla TS objects; data export is JSON; documented swap to Postgres if procurement requires it
12. **Known limitations and "what we'd build next"** — honesty, with priorities
13. **Contacts** — team emails for transition Q&A window (e.g., 2 weeks)

---

## 13. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Anthropic API rate-limited or down during demo | Low | High | Cache last persona runs in `chatCache`; demo page falls back to cached responses if API fails. |
| Convex free tier exhausted | Low | Medium | Demo with warm queries first; upgrade to Pro ($25) if at risk. |
| Vercel deploy fails Sunday | Low | High | Backup video recorded by hour 28. Local dev mirror ready to run. |
| Synthetic queries are bad quality | Medium | Medium | Manual review of 5 samples Saturday morning, iterate prompt before bulk seed. |
| Map performance with full dataset | Medium | Low | Cluster aggressively; lazy-load profile data. |
| Magic link domain check fails for legit users (e.g., gmail) | Medium | Medium | Fall back to "request manual verification" form that lands in admin queue. |
| Team member loses ~6 hours sleeping | High | Medium | Workstreams designed independent; one person down ≠ blocker. |
| Judges don't read the reactive admin moment | Medium | High | Demo step 3 makes it impossible to miss. |
| GOED procurement balks at Convex SaaS | Medium | Medium | **Self-host path documented and tested before demo.** Show both options in the handoff section. |
| Convex schema/function bugs late in build | Medium | Medium | TypeScript end-to-end means most break at compile time. Add `tests/retrieval.test.ts` to catch silent regressions. |
| Custom admin UI under-polished compared to Payload baseline | Medium | High | Workstream G is its own track from hour 4 — no piggyback. Hard cap on scope: resources CRUD, companies moderation, conversations read-only. Nothing else. |

---

## 14. Appendices

### 14.1 Environment variables (`.env.example`)

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

# Feature flags
ENABLE_CHAT=true
CHAT_RATE_LIMIT_PER_MINUTE=20
```

### 14.2 Synthetic query generation prompt (v1 draft)

Lives in `convex/ai/prompts/synthetic-queries.ts`. Iterate Saturday morning.

> You are helping Utah founders find the right state resource. Below is a description of one program available through Utah's Startup State initiative.
>
> Generate 10 questions a real founder might ask in their own words that this program would answer. Vary the phrasing, urgency level, and specificity. Use natural founder language — not government language. Cover questions about eligibility, the problem being solved, life situations, and adjacent concerns a founder might have. Some should be specific ("Does this work for a $25k microloan in Weber County?"); some vague ("How do I get money to start a business?").
>
> Return a JSON array of strings.

### 14.3 Chat system prompt skeleton (v1 draft)

> You are the Utah Startup State Resource Guide. You help founders find the right state programs, capital, mentorship, and education resources for their specific situation.
>
> **Rules:**
> 1. Every recommendation must cite a specific resource from the context provided. Use this format: `[Resource Name](url)`.
> 2. If no resource in the context matches the user's question, say so plainly. Suggest the closest adjacent resource and recommend the user contact GOED directly. Do not invent programs.
> 3. If user intake context is provided (location, stage, demographic), tailor your answer to that context.
> 4. Use plain, direct language. Founders are busy. Skip preambles.
>
> **Context (top retrieved resources):** {{resources}}
>
> **User intake (if any):** {{intake}}

### 14.4 Persona test fixtures

The 6 spec personas live in `apps/web/lib/personas.ts` as typed objects, used by both `tests/personas.test.ts` and the `/demo` page.

```ts
export const personas = [
  { id: 'jordan', name: 'Jordan, 20', location: 'Salt Lake City', stage: 'idea', industry: null, demographic: ['young'], blocker: 'I have an idea but no business yet' },
  { id: 'maria', name: 'Maria, 38', location: 'Washington County', stage: 'early', industry: 'agriculture', demographic: ['women','rural'], blocker: 'Looking to scale my small agricultural operation' },
  { id: 'marcus', name: 'Marcus, 34', location: 'Weber County', stage: 'early', industry: 'manufacturing', demographic: ['veteran'], blocker: 'Starting a custom fabrication business after leaving the military' },
  { id: 'priya', name: 'Priya, 31', location: 'Salt Lake City', stage: 'growth', industry: 'b2b-saas', demographic: [], blocker: 'Ready to raise my first venture round, looking for VCs and angels' },
  { id: 'david', name: 'David, 45', location: 'Utah County', stage: 'scaling', industry: 'medical-devices', demographic: [], blocker: 'FDA cleared, looking to expand to international markets' },
  { id: 'amir', name: 'Dr. Amir, 29', location: 'Salt Lake City', stage: 'idea', industry: 'deep-tech', demographic: ['academic'], blocker: 'PhD candidate wanting to commercialize my research' },
];
```

### 14.5 Pre-flight checklist (before code starts)

- [ ] Anthropic account with $100 credit, daily budget alert set at $50
- [ ] OpenAI account with $5 credit
- [ ] Vercel account, team created, GitHub connected
- [ ] Convex account, project created, dev + prod deployments
- [ ] Resend account, sender domain verified (or use sandbox for demo)
- [ ] Sentry account, project created
- [ ] Mapbox account, public token created
- [ ] GitHub repo created, all team members invited
- [ ] 1Password vault shared with team, all secrets stored
- [ ] Domain purchased (optional)
- [ ] Provided Google Sheets exported to CSV in `data/seed/`

---

**This plan is a working document. Update it as decisions change. Every workstream owner is responsible for keeping their section accurate.**
