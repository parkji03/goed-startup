# startup.utah.gov — Crawled Content

All public content from <https://startup.utah.gov> — 176 pages, organized by category.

_Crawled 2026-05-08 via WP REST API + html2text. Source URL preserved in each file's frontmatter._

## Categories

### [Core Pages](./pages/) (28)
Top-level navigation pages — home, why-utah, entrepreneur journey, resource hub, etc.

### [Get Started](./get-started/) (10)
The Get Started Business Idea Challenge — winners, programs, milestones.

### [Resources](./resources/) (34)
Guides and resources for Utah entrepreneurs.

### [Funding](./funding/) (16)
Posts about grants, investors, pitch competitions, and funding programs.

### [Events](./events/) (13)
Conferences, summits, and startup events.

### [Newsletter](./newsletter/) (12)
Monthly Startup State newsletter archive.

### [Company Spotlights](./company-spotlights/) (27)
Profiles of Utah-based companies and founders.

### [State Programs](./state-programs/) (2)
State-run programs and initiatives for entrepreneurs.

### [News](./news/) (34)
General news posts about Utah's startup ecosystem and economy.

## File format

Every markdown file starts with YAML frontmatter:

```yaml
---
title: "Article title"
url: https://startup.utah.gov/...
category: news
all_categories: ["news", "archived"]
type: post
date: 2025-04-04T10:00:00
modified: 2026-04-13T14:10:57
---
```

## Excluded URLs

- `https://startup.utah.gov/events/list/?tribe_eventcategory%5B0%5D=343` — broken (404)
- All non-`startup.utah.gov` links (external resources are referenced inline but not crawled)
- `/news/`, `/category/*` — dynamic listing pages whose content is the posts themselves
