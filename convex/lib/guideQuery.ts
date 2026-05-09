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

/** Lowercase, strip punctuation, append a few profile-derived terms when missing. */
export function expandQuery(query: string, profile: FounderProfileConvex): string {
  const base = query.toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const adds: string[] = [];
  for (const i of profile.industries) if (!base.includes(i.toLowerCase())) adds.push(i.toLowerCase());
  for (const s of profile.stages) if (!base.includes(s.toLowerCase())) adds.push(s.toLowerCase());
  for (const c of profile.counties) if (!base.includes(c.toLowerCase())) adds.push(c.toLowerCase());
  for (const a of profile.audiences) if (!base.includes(a.toLowerCase())) adds.push(a.toLowerCase());
  return adds.length ? `${base} ${adds.join(' ')}` : base;
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
