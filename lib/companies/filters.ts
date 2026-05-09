/**
 * URL-encoded filter state for the map.
 *
 * Persisted to the URL so views are shareable and survive refresh:
 *   ?q=lehi&sector=fintech,consumer&stage=seed,series-a&employees=11-50&city=lehi,provo&hiring=hiring,not-hiring
 *
 * Empty values aren't serialized at all (no `?q=&sector=`) — the URL stays
 * tidy when nothing is filtered.
 */

import {
  isEmployeeCountId,
  isHiringStatusFilterId,
  isSectorId,
  isStageId,
  type EmployeeCountId,
  type HiringStatusFilterId,
  type SectorId,
  type StageId,
} from './taxonomy';
import {
  isChequeBucketId,
  isInvestorStageId,
  isInvestorTypeId,
  type ChequeBucketId,
  type InvestorStageId,
  type InvestorTypeId,
} from '../investors/taxonomy';

/**
 * Which entity kinds the map should render. The default (`['company']`) keeps
 * the original Utah ecosystem view as-is; opting in to investors floods the
 * map with the OpenVC corpus (~2.5k pins, mostly outside Utah).
 */
export const ENTITY_TYPE_IDS = ['company', 'investor'] as const;
export type EntityTypeId = (typeof ENTITY_TYPE_IDS)[number];
export function isEntityTypeId(s: string): s is EntityTypeId {
  return (ENTITY_TYPE_IDS as readonly string[]).includes(s);
}
export const DEFAULT_ENTITY_TYPES: EntityTypeId[] = ['company'];

export type MapFilters = {
  q: string;
  types: EntityTypeId[];
  // Company-side facets — apply only to the `'company'` layer when active.
  sectors: SectorId[];
  stages: StageId[];
  employeeCounts: EmployeeCountId[];
  cities: string[];
  hiringStatuses: HiringStatusFilterId[];
  // Investor-side facets — apply only to the `'investor'` layer when active.
  // Names are prefixed with `investor*` to keep the distinction obvious at
  // call-sites and avoid collisions with the company `stages` field.
  investorTypes: InvestorTypeId[];
  investorStages: InvestorStageId[];
  chequeBuckets: ChequeBucketId[];
  investorCountries: string[];
};

export const EMPTY_FILTERS: MapFilters = {
  q: '',
  types: DEFAULT_ENTITY_TYPES,
  sectors: [],
  stages: [],
  employeeCounts: [],
  cities: [],
  hiringStatuses: [],
  investorTypes: [],
  investorStages: [],
  chequeBuckets: [],
  investorCountries: [],
};

/**
 * Treat `types` as "active" only when it diverges from the default
 * (`['company']`). Otherwise opening the map with no investor toggle would
 * still be flagged active and pop the chip row open on every load.
 *
 * Exported so the filter bar's count badge agrees with `isFiltersActive`.
 */
export function isTypesNonDefault(types: EntityTypeId[]): boolean {
  if (types.length !== DEFAULT_ENTITY_TYPES.length) return true;
  const set = new Set(types);
  return DEFAULT_ENTITY_TYPES.some((id) => !set.has(id));
}

export function isFiltersActive(f: MapFilters): boolean {
  return (
    f.q.trim().length > 0 ||
    isTypesNonDefault(f.types) ||
    f.sectors.length > 0 ||
    f.stages.length > 0 ||
    f.employeeCounts.length > 0 ||
    f.cities.length > 0 ||
    f.hiringStatuses.length > 0 ||
    f.investorTypes.length > 0 ||
    f.investorStages.length > 0 ||
    f.chequeBuckets.length > 0 ||
    f.investorCountries.length > 0
  );
}

/**
 * Parse a CSV-encoded URL param into a deduped array, then validate each
 * item against a type guard. Unknown values are silently dropped — that
 * way a stale or hand-edited URL never crashes the page.
 */
function parseCsvParam<T extends string>(
  raw: string | null | undefined,
  guard: (s: string) => s is T,
): T[] {
  if (!raw) return [];
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const seen = new Set<T>();
  for (const p of parts) {
    if (guard(p)) seen.add(p);
  }
  return Array.from(seen);
}

export function parseFiltersFromParams(
  params: URLSearchParams | ReadonlyURLSearchParams,
): MapFilters {
  const parsedTypes = parseCsvParam(params.get('type'), isEntityTypeId);
  return {
    q: (params.get('q') ?? '').trim(),
    // Empty/missing `type` param falls back to the default. Once a user
    // toggles investors off entirely we still write `?type=...` (handled
    // by the serializer + filter bar), so an empty array here always means
    // "no override" rather than "user selected nothing".
    types: parsedTypes.length > 0 ? parsedTypes : DEFAULT_ENTITY_TYPES,
    sectors: parseCsvParam(params.get('sector'), isSectorId),
    stages: parseCsvParam(params.get('stage'), isStageId),
    employeeCounts: parseCsvParam(params.get('employees'), isEmployeeCountId),
    cities: parseCitiesCsv(params.get('city')),
    hiringStatuses: parseCsvParam(params.get('hiring'), isHiringStatusFilterId),
    investorTypes: parseCsvParam(params.get('iType'), isInvestorTypeId),
    investorStages: parseCsvParam(params.get('iStage'), isInvestorStageId),
    chequeBuckets: parseCsvParam(params.get('cheque'), isChequeBucketId),
    investorCountries: parseCitiesCsv(params.get('iCountry')),
  };
}

/**
 * Cities are free-form strings (no closed enum), so parseCsvParam with its
 * type-guard pattern doesn't apply — any non-empty trimmed value is valid.
 */
function parseCitiesCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return Array.from(seen);
}

/**
 * Serialize filters back to a URLSearchParams string. Returns just the
 * query (without the leading `?`) so callers can compose with their own
 * pathname.
 */
export function serializeFiltersToParams(f: MapFilters): string {
  const params = new URLSearchParams();
  const q = f.q.trim();
  if (q) params.set('q', q);
  // Only serialize `type` when it diverges from the default — keeps shareable
  // URLs tidy for the common case (companies-only).
  if (isTypesNonDefault(f.types)) params.set('type', f.types.join(','));
  if (f.sectors.length) params.set('sector', f.sectors.join(','));
  if (f.stages.length) params.set('stage', f.stages.join(','));
  if (f.employeeCounts.length) params.set('employees', f.employeeCounts.join(','));
  if (f.cities.length) params.set('city', f.cities.join(','));
  if (f.hiringStatuses.length) params.set('hiring', f.hiringStatuses.join(','));
  // Investor-side params — `i*` prefix to namespace them away from the
  // company chips (e.g., `stage` is companies, `iStage` is investors).
  if (f.investorTypes.length) params.set('iType', f.investorTypes.join(','));
  if (f.investorStages.length) params.set('iStage', f.investorStages.join(','));
  if (f.chequeBuckets.length) params.set('cheque', f.chequeBuckets.join(','));
  if (f.investorCountries.length)
    params.set('iCountry', f.investorCountries.join(','));
  return params.toString();
}

// Next.js's useSearchParams returns this read-only view; we accept either it
// or a regular URLSearchParams for flexibility.
type ReadonlyURLSearchParams = {
  get: (key: string) => string | null;
};
