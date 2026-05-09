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

export type MapFilters = {
  q: string;
  sectors: SectorId[];
  stages: StageId[];
  employeeCounts: EmployeeCountId[];
  cities: string[];
  hiringStatuses: HiringStatusFilterId[];
};

export const EMPTY_FILTERS: MapFilters = {
  q: '',
  sectors: [],
  stages: [],
  employeeCounts: [],
  cities: [],
  hiringStatuses: [],
};

export function isFiltersActive(f: MapFilters): boolean {
  return (
    f.q.trim().length > 0 ||
    f.sectors.length > 0 ||
    f.stages.length > 0 ||
    f.employeeCounts.length > 0 ||
    f.cities.length > 0 ||
    f.hiringStatuses.length > 0
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
  return {
    q: (params.get('q') ?? '').trim(),
    sectors: parseCsvParam(params.get('sector'), isSectorId),
    stages: parseCsvParam(params.get('stage'), isStageId),
    employeeCounts: parseCsvParam(params.get('employees'), isEmployeeCountId),
    cities: parseCitiesCsv(params.get('city')),
    hiringStatuses: parseCsvParam(params.get('hiring'), isHiringStatusFilterId),
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
  if (f.sectors.length) params.set('sector', f.sectors.join(','));
  if (f.stages.length) params.set('stage', f.stages.join(','));
  if (f.employeeCounts.length) params.set('employees', f.employeeCounts.join(','));
  if (f.cities.length) params.set('city', f.cities.join(','));
  if (f.hiringStatuses.length) params.set('hiring', f.hiringStatuses.join(','));
  return params.toString();
}

// Next.js's useSearchParams returns this read-only view; we accept either it
// or a regular URLSearchParams for flexibility.
type ReadonlyURLSearchParams = {
  get: (key: string) => string | null;
};
