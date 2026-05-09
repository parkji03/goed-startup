'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FeatureCollection, Point } from 'geojson';
import { api } from '@/convex/_generated/api';
import type {
  EmployeeCountId,
  SectorId,
  StageId,
} from '@/lib/companies/taxonomy';
import type { InvestorBrief } from '@/lib/companies/investor-brief';
import { EMPTY_FILTERS, type MapFilters } from '@/lib/companies/filters';

/**
 * Trimmed properties carried in each map feature — only what the renderer
 * needs (everything else is fetched separately for the cards).
 */
export type CompanyFeatureProps = {
  _id: string;
  name: string;
  slug: string;
  sector: SectorId;
  website?: string;
};

/**
 * Full per-company record consumed by the results sidebar's cards.
 */
export type CompanyForList = {
  _id: string;
  name: string;
  slug: string;
  sector: SectorId;
  stage?: StageId;
  employeeCount?: EmployeeCountId;
  yearFounded?: number;
  description?: string;
  website?: string;
  linkedin?: string;
  location: {
    rawAddress: string;
    city?: string;
    county?: string;
    state?: string;
  };
  lng: number;
  lat: number;
  investorBrief?: InvestorBrief;
};

export type FilteredCompanies = {
  /** Raw companies the list view consumes. */
  companies: CompanyForList[];
  /** Map-source-ready FeatureCollection. Stable identity across renders. */
  geojson: FeatureCollection<Point, CompanyFeatureProps>;
};

/**
 * Reactively subscribes to `companies.searchForMap` and returns both the
 * raw company array (for the results sidebar) and a GeoJSON
 * FeatureCollection (for `map.getSource(...).setData()`).
 *
 * Sharing one query between the map and the list keeps the two views in
 * lockstep — the marker count and the card count always agree because
 * they're projected from the same row set.
 *
 * Returns `undefined` while the query is loading. Memoized on the query
 * result reference so object identity is stable when the data hasn't
 * changed.
 */
export function useFilteredCompanies(
  filters: MapFilters = EMPTY_FILTERS,
): FilteredCompanies | undefined {
  // Build the Convex args object, omitting empty arrays so the query path
  // can short-circuit ("no constraint on that dimension").
  const queryArgs = useMemo(
    () => ({
      q: filters.q.trim() || undefined,
      sectors: filters.sectors.length ? filters.sectors : undefined,
      stages: filters.stages.length ? filters.stages : undefined,
      employeeCounts: filters.employeeCounts.length
        ? filters.employeeCounts
        : undefined,
      cities: filters.cities.length ? filters.cities : undefined,
    }),
    [
      filters.q,
      filters.sectors,
      filters.stages,
      filters.employeeCounts,
      filters.cities,
    ],
  );

  const rows = useQuery(api.companies.searchForMap, queryArgs);

  return useMemo(() => {
    if (!rows) return undefined;
    const geojson: FeatureCollection<Point, CompanyFeatureProps> = {
      type: 'FeatureCollection',
      features: rows.map((c, i) => ({
        type: 'Feature',
        id: i, // numeric id required by setFeatureState
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          _id: c._id,
          name: c.name,
          slug: c.slug,
          sector: c.sector,
          website: c.website,
        },
      })),
    };
    return { companies: rows, geojson };
  }, [rows]);
}
