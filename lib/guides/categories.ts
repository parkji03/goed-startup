/**
 * Guide category labels for UI rendering. Keys mirror
 * convex/guideValidators.ts — keep in sync.
 */
export const GUIDE_CATEGORY_KEYS = [
  'funding',
  'networking',
  'legal-ip',
  'pitch',
  'international-trade',
  'idea-validation',
  'media',
  'journey-step',
] as const;

export type GuideCategoryKey = (typeof GUIDE_CATEGORY_KEYS)[number];

export const GUIDE_CATEGORIES: ReadonlyArray<{
  key: GuideCategoryKey;
  label: string;
  tagline: string;
}> = [
  { key: 'funding', label: 'Funding', tagline: 'Grants, pitch comps, capital strategy' },
  { key: 'networking', label: 'Networking', tagline: 'Events, communities, coworking' },
  { key: 'legal-ip', label: 'Legal & IP', tagline: 'Trademarks, patents, structure' },
  { key: 'pitch', label: 'Pitch', tagline: 'Deck and presentation playbooks' },
  { key: 'international-trade', label: 'International Trade', tagline: 'Going global from Utah' },
  { key: 'idea-validation', label: 'Idea & Validation', tagline: 'From passion to viable business' },
  { key: 'media', label: 'Media', tagline: 'Podcasts and video series' },
  { key: 'journey-step', label: 'Founder Journey', tagline: 'The 19 steps from idea to exit' },
];

const LABEL_BY_KEY: Record<GuideCategoryKey, string> = Object.fromEntries(
  GUIDE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<GuideCategoryKey, string>;

export function guideCategoryLabel(key: GuideCategoryKey): string {
  return LABEL_BY_KEY[key];
}

export function isGuideCategoryKey(value: unknown): value is GuideCategoryKey {
  return typeof value === 'string' && (GUIDE_CATEGORY_KEYS as readonly string[]).includes(value);
}
