import type { FounderProfileConvex } from '../founderProfile';
import { scoreResourceForProfile } from './matchResources';

const MAX_QUERY_LENGTH = 2000;

export type ValidatedQuery = { ok: true; query: string } | { ok: false; reason: 'too-long' };

/**
 * Strip control chars, trim, length-cap. Same cap the route applies, applied
 * again here defense-in-depth because `retrieve` is a public action.
 */
export function validateRetrievalInput(raw: string): ValidatedQuery {
  if (raw.length > MAX_QUERY_LENGTH) return { ok: false, reason: 'too-long' };
  const stripped = raw.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return { ok: true, query: stripped.trim() };
}

/**
 * Normalize the user's typed query for full-text search: lowercase, strip
 * punctuation, collapse whitespace.
 *
 * Earlier versions also injected profile-derived terms (industries, stages,
 * counties, audiences) into the query string. That made lexical retrieval
 * already profile-biased, which made the downstream `rankWithProfile` +
 * `filterByProfileSignal` steps redundant — every retrieved hit "matched"
 * the profile because we'd asked the index for profile-matching hits in the
 * first place. Profile influence now lives entirely in the rank/filter
 * layer, where it can actually create variance in the result set.
 */
export function expandQuery(query: string, _profile: FounderProfileConvex): string {
  return query.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Build a query string from profile alone — used as fallback when input is empty/weak. */
export function synthesizeQueryFromProfile(profile: FounderProfileConvex): string {
  return [...profile.industries, ...profile.stages, ...profile.counties]
    .map((s) => s.toLowerCase())
    .join(' ')
    .trim();
}

type RankableHit = Parameters<typeof scoreResourceForProfile>[0] & { slug: string };

/** Stable-sorts by profile score (descending). Original order kept on ties. */
export function rankWithProfile<T extends RankableHit>(hits: T[], profile: FounderProfileConvex): T[] {
  return hits
    .map((hit, index) => ({ hit, index, score: scoreResourceForProfile(hit, profile) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.hit);
}

/**
 * Drop padding when there's a real personalization signal.
 *
 * If at least one hit has a profile-match score > 0, we keep only those —
 * the zero-score stragglers were pulled in by lexical relevance alone and
 * tend to feel like padding once the user has a meaningful profile match.
 *
 * If no hit has any profile signal (e.g., the founder hasn't filled out the
 * quiz, or none of their profile fields overlap), we keep everything and
 * fall back to pure lexical ordering — the alternative is showing zero
 * results, which is worse.
 */
export function filterByProfileSignal<T extends RankableHit>(
  hits: T[],
  profile: FounderProfileConvex,
): T[] {
  const scored = hits.map((hit) => ({ hit, score: scoreResourceForProfile(hit, profile) }));
  const hasSignal = scored.some((s) => s.score > 0);
  if (!hasSignal) return hits;
  return scored.filter((s) => s.score > 0).map((s) => s.hit);
}
