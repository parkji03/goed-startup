import type { GuideCategoryKey } from '../../lib/guides/categories';
import { guideCategoryLabel } from '../../lib/guides/categories';
import { slugify } from './resourceHelpers';

export function makeGuideSlug(title: string, sourceId: string): string {
  const base = slugify(title) || 'guide';
  const idPart = slugify(sourceId) || sourceId.replace(/\W+/g, '-');
  return `${base}-${idPart}`.slice(0, 120);
}

export function buildGuideSearchText(parts: {
  title: string;
  description: string;
  body: string;
  category: GuideCategoryKey;
  tags: string[];
  stageTags: string[];
  journeyStep?: number;
}): string {
  const chunks: Array<string | undefined> = [
    parts.title,
    parts.description,
    guideCategoryLabel(parts.category),
    ...parts.tags,
    ...parts.stageTags,
    parts.journeyStep !== undefined ? `Step ${parts.journeyStep}` : undefined,
    parts.body,
  ];
  return chunks.filter(Boolean).join(' | ');
}

export type GuideFacetRowInput = {
  facetType: 'category' | 'tag' | 'stage';
  value: string;
};

export function facetsFromGuideFields(args: {
  category: GuideCategoryKey;
  tags: string[];
  stageTags: string[];
}): GuideFacetRowInput[] {
  const out: GuideFacetRowInput[] = [];
  out.push({ facetType: 'category', value: args.category });
  for (const value of args.tags) out.push({ facetType: 'tag', value });
  for (const value of args.stageTags) out.push({ facetType: 'stage', value });
  return out;
}
