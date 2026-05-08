'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FeatureCollection, Point } from 'geojson';
import { api } from '@/convex/_generated/api';
import type { SectorId } from '@/lib/companies/taxonomy';

export type CompanyFeatureProps = {
  _id: string;
  name: string;
  slug: string;
  sector: SectorId;
};

/**
 * Reactively subscribes to `companies.listForMap` and reshapes the result
 * into a GeoJSON FeatureCollection ready for `map.getSource(...).setData()`.
 *
 * Returns `undefined` while the query is loading. Memoized on the query
 * result reference so the GeoJSON object identity is stable across renders
 * with no data change.
 */
export function useCompaniesGeoJson():
  | FeatureCollection<Point, CompanyFeatureProps>
  | undefined {
  const companies = useQuery(api.companies.listForMap);

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
        },
      })),
    };
  }, [companies]);
}
