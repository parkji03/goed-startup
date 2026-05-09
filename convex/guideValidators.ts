import { v } from 'convex/values';

/**
 * Guide categories — closed enum, parallel to resourceCategoryValidator but
 * tuned for educational/how-to content rather than programs.
 *
 *   funding              "Explore Grants", "Crowdfunding 101", "Pitch Competitions"
 *   networking           "5 Ways to Build a Network", "Coworking Spaces"
 *   legal-ip             "Bolstering Your Business With IP"
 *   pitch                "6 Things to Include in Your Pitch Deck"
 *   international-trade  "Ready To Go Global"
 *   idea-validation      "Turning Your Passion Into a Successful Business Idea"
 *   media                Podcasts, video series, audio content
 *   journey-step         The 19 lifecycle pages on startup.utah.gov
 */
export const guideCategoryValidator = v.union(
  v.literal('funding'),
  v.literal('networking'),
  v.literal('legal-ip'),
  v.literal('pitch'),
  v.literal('international-trade'),
  v.literal('idea-validation'),
  v.literal('media'),
  v.literal('journey-step'),
);

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
