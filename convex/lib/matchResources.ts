import type { Doc } from '../_generated/dataModel';
import type { FounderProfileConvex } from '../founderProfile';

type ResourceTags = Pick<
  Doc<'resources'>,
  'communities' | 'industries' | 'locations' | 'tags' | 'stageTags' | 'category'
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

/** Deterministic personalization score — used by quiz results + AI reranking. */
export function scoreResourceForProfile(
  resource: ResourceTags,
  profile: FounderProfileConvex,
): number {
  let score = 0;

  // Category match: profile goals contain words from the category key.
  if (resource.category) {
    const catWords = resource.category.split('-');
    const goalText = profile.goals.join(' ').toLowerCase();
    if (catWords.some((w) => goalText.includes(w))) {
      score += WEIGHTS.category;
    }
  }

  const tagPool = resource.tags;

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
