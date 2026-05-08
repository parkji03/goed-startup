'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FeatureCollection, Point } from 'geojson';
import { api } from '@/convex/_generated/api';
import type { SectorId } from '@/lib/companies/taxonomy';
import { EMPTY_FILTERS, type MapFilters } from '@/lib/companies/filters';

export type CompanyFeatureProps = {
  _id: string;
  name: string;
  slug: string;
  sector: SectorId;
  website?: string;
};

export type CompaniesGeoJson =
  | FeatureCollection<Point, CompanyFeatureProps>
  | undefined;

/**
 * Reactively subscribes to `companies.searchForMap` and reshapes the result
 * into a GeoJSON FeatureCollection ready for `map.getSource(...).setData()`.
 *
 * The hook is the single read-side surface for the map: passing different
 * filters produces a different reactive subscription, and Mapbox re-renders
 * cleanly via `source.setData(geojson)`.
 *
 * Returns `undefined` while the query is loading. Memoized on the query
 * result reference so the GeoJSON object identity is stable across renders
 * with no data change.
 */
export function useCompaniesGeoJson(
  filters: MapFilters = EMPTY_FILTERS,
): CompaniesGeoJson {
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
    }),
    [filters.q, filters.sectors, filters.stages, filters.employeeCounts],
  );

  const companies = useQuery(api.companies.searchForMap, queryArgs);

  return useMemo(() => {
    if (!companies) return undefined;
    return {
      type: 'FeatureCollection',
      features: companies.map((c, i) => ({
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
  }, [companies]);
}
