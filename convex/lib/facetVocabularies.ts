/**
 * Canonical facet vocabularies — the closed set of values our filter UI knows
 * how to render and the agent retrieval scores against.
 *
 * Anything that lands in the resources table outside these sets pollutes the
 * filter dropdowns and can leak into the agent's context. The CSV catalog
 * defines the source of truth (data/resources-builder-day.csv); the sets
 * below mirror it. Keep them in sync when the CSV adds a new value.
 */

export const COMMUNITY_VOCAB: ReadonlySet<string> = new Set([
  'Any',
  'Rural',
  'Multicultural',
  'Student',
  'Women',
  'Veteran',
  'New American',
]);

export const INDUSTRY_VOCAB: ReadonlySet<string> = new Set([
  'Aerospace and Defense',
  'Agriculture',
  'Arts and Entertainment and Recreation',
  'Consumer Packaged Goods',
  'Financial Services',
  'Hospitality and Food Services',
  'Life Sciences and Healthcare',
  'Manufacturing',
  'Other',
  'Software and Information Technology',
]);

/** Utah counties, exact casing as they appear in the CSV. */
export const LOCATION_VOCAB: ReadonlySet<string> = new Set([
  'Beaver',
  'Box Elder',
  'Cache',
  'Carbon',
  'Daggett',
  'Davis',
  'Duchesne',
  'Emery',
  'Garfield',
  'Grand',
  'Iron',
  'Juab',
  'Kane',
  'Millard',
  'Morgan',
  'Piute',
  'Rich',
  'Salt Lake',
  'San Juan',
  'Sanpete',
  'Sevier',
  'Summit',
  'Tooele',
  'Uintah',
  'Utah',
  'Wasatch',
  'Washington',
  'Wayne',
  'Weber',
]);

/**
 * Drop values not in the vocabulary; preserve order and dedupe.
 *
 * Used as a defense-in-depth check at write time: even if the seed/import
 * script has its own pre-flight validation (P1.1), this guard runs at the
 * Convex mutation boundary so bad LLM output can't slip through. Unknown
 * values are logged once per call so drift is visible in the dashboard.
 */
export function clampToVocab(
  values: string[],
  vocab: ReadonlySet<string>,
  label: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const dropped: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (vocab.has(trimmed)) {
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        out.push(trimmed);
      }
    } else {
      dropped.push(trimmed);
    }
  }
  if (dropped.length > 0) {
    console.warn(`[resource-clamp] dropped ${dropped.length} non-vocab ${label}:`, dropped);
  }
  return out;
}
