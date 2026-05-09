/**
 * URL-encoded filter state for the resource list.
 *
 *   ?stage=seed,series-a&industry=fintech&community=women&location=salt-lake-city
 *
 * Empty facets aren't serialized so the URL stays clean when nothing is
 * filtered. All values are free-form strings (facet vocab is data-driven,
 * not a closed enum), so unknown values are preserved on round-trip — that
 * way a chip stays selected even if its option happens to fall off the
 * server's count-sorted list.
 */

export type ResourceFilters = {
  stages: string[];
  industries: string[];
  communities: string[];
  locations: string[];
};

export const EMPTY_RESOURCE_FILTERS: ResourceFilters = {
  stages: [],
  industries: [],
  communities: [],
  locations: [],
};

export function isResourceFiltersActive(f: ResourceFilters): boolean {
  return (
    f.stages.length > 0 ||
    f.industries.length > 0 ||
    f.communities.length > 0 ||
    f.locations.length > 0
  );
}

export function countActiveResourceFilters(f: ResourceFilters): number {
  return (
    f.stages.length + f.industries.length + f.communities.length + f.locations.length
  );
}

function parseCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (trimmed) seen.add(trimmed);
  }
  return Array.from(seen);
}

type ReadonlyURLSearchParams = { get: (key: string) => string | null };

export function parseResourceFiltersFromParams(
  params: URLSearchParams | ReadonlyURLSearchParams,
): ResourceFilters {
  return {
    stages: parseCsv(params.get('stage')),
    industries: parseCsv(params.get('industry')),
    communities: parseCsv(params.get('community')),
    locations: parseCsv(params.get('location')),
  };
}

/** Returns just the query (no leading `?`) so callers can compose with their pathname. */
export function serializeResourceFiltersToParams(f: ResourceFilters): string {
  const params = new URLSearchParams();
  if (f.stages.length) params.set('stage', f.stages.join(','));
  if (f.industries.length) params.set('industry', f.industries.join(','));
  if (f.communities.length) params.set('community', f.communities.join(','));
  if (f.locations.length) params.set('location', f.locations.join(','));
  return params.toString();
}

type FilterableResource = {
  stageTags: string[];
  industries: string[];
  communities: string[];
  locations: string[];
};

/**
 * Within a facet: ANY-match (resource's value list intersects the selection).
 * Across facets: ALL-match (every active facet must hit). Empty facets are no-ops.
 */
export function matchesResourceFilters(r: FilterableResource, f: ResourceFilters): boolean {
  if (f.stages.length && !f.stages.some((s) => r.stageTags.includes(s))) return false;
  if (f.industries.length && !f.industries.some((s) => r.industries.includes(s))) return false;
  if (f.communities.length && !f.communities.some((s) => r.communities.includes(s))) return false;
  if (f.locations.length && !f.locations.some((s) => r.locations.includes(s))) return false;
  return true;
}
