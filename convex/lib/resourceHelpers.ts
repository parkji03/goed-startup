import type { ResourceCategoryKey } from '../../lib/resources/categories';
import { categoryLabel } from '../../lib/resources/categories';
import type { FacetType } from './facetTypes';

/** Canonical form for Convex + mailto: (no ?, &, newlines — seeds/imports only). */
export function sanitizeContactEmail(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  const trimmed = raw.trim().replace(/^mailto:/i, '');
  const first = trimmed.split(/[\s,;<>"']/)[0] ?? '';
  if (first.length < 5 || first.length > 254) return undefined;
  if (!/^[\w%+.-]+@[\w.-]+\.[a-z]{2,}$/i.test(first)) return undefined;
  return first.toLowerCase();
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function makeResourceSlug(title: string, sourceId: string): string {
  const base = slugify(title) || 'resource';
  const idPart = slugify(sourceId) || sourceId.replace(/\W+/g, '-');
  return `${base}-${idPart}`.slice(0, 120);
}

export function splitPipeList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  stageTags: string[];
  body?: string;
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
    ...parts.stageTags,
    parts.body,
  ];
  return chunks.filter(Boolean).join(' | ');
}

export type FacetRowInput = {
  facetType: FacetType;
  value: string;
};

export function facetsFromResourceFields(args: {
  category?: ResourceCategoryKey;
  communities: string[];
  industries: string[];
  locations: string[];
  tags: string[];
  stageTags: string[];
}): FacetRowInput[] {
  const out: FacetRowInput[] = [];
  if (args.category) out.push({ facetType: 'category', value: args.category });
  for (const value of args.communities) out.push({ facetType: 'community', value });
  for (const value of args.industries) out.push({ facetType: 'industry', value });
  for (const value of args.locations) out.push({ facetType: 'location', value });
  for (const value of args.tags) out.push({ facetType: 'tag', value });
  for (const value of args.stageTags) out.push({ facetType: 'stage', value });
  return out;
}

const STAGE_KEYWORDS = [
  'pre-seed',
  'pre seed',
  'seed',
  'series a',
  'series b',
  'series c',
  'growth',
  'late stage',
  'early stage',
  'idea',
  'startup',
  'scale',
] as const;

export function inferStageTagsFromTags(tags: string[]): string[] {
  const found = new Set<string>();
  for (const t of tags) {
    const lower = t.toLowerCase();
    for (const kw of STAGE_KEYWORDS) {
      if (lower.includes(kw)) {
        found.add(t);
        break;
      }
    }
  }
  return [...found];
}

export function embeddingSourceText(parts: {
  title: string;
  description: string;
  category?: ResourceCategoryKey;
  tags: string[];
  industries: string[];
  communities: string[];
  locations: string[];
}): string {
  return [
    `Title: ${parts.title}`,
    `Description: ${parts.description}`,
    parts.category ? `Category: ${categoryLabel(parts.category)}` : '',
    `Tags: ${parts.tags.join('; ')}`,
    `Industries: ${parts.industries.join('; ')}`,
    `Communities: ${parts.communities.join('; ')}`,
    `Locations: ${parts.locations.join('; ')}`,
  ]
    .filter(Boolean)
    .join('\n');
}
