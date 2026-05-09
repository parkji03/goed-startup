'use client';

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FeatureCollection, Point } from 'geojson';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  hiringFilterIdToStatus,
  type EmployeeCountId,
  type SectorId,
  type StageId,
} from '@/lib/companies/taxonomy';
import type { InvestorBrief } from '@/lib/companies/investor-brief';
import { EMPTY_FILTERS, type MapFilters } from '@/lib/companies/filters';
import {
  CHEQUE_BUCKETS,
  INVESTOR_STAGE_TO_RAW,
  INVESTOR_TYPE_TO_RAW,
} from '@/lib/investors/taxonomy';

/**
 * Trimmed properties carried in each map feature — only what the renderer
 * needs (everything else is fetched separately for the cards).
 *
 * `_id` is typed as a plain string here because Mapbox's GeoJSON feature
 * properties must be JSON-serializable, and the branded `Id<...>` type
 * doesn't survive the round-trip through the GL JS source.
 */
export type CompanyFeatureProps = {
  kind: 'company';
  _id: string;
  name: string;
  slug: string;
  sector: SectorId;
  website?: string;
};

export type InvestorFeatureProps = {
  kind: 'investor';
  _id: string;
  name: string;
  slug: string;
  /** Free-form OpenVC type ("VC", "Solo angel", etc.). */
  investorType?: string;
  website?: string;
};

/**
 * Discriminated union the marker renderer branches on. Both shapes carry
 * `_id`/`name`/`slug` so generic UI (selection state, hover label) doesn't
 * need to peek at `kind`.
 */
export type EntityFeatureProps = CompanyFeatureProps | InvestorFeatureProps;

/**
 * Full per-company record consumed by the results sidebar's cards.
 */
export type CompanyForList = {
  _id: Id<'companies'>;
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
  /**
   * Hiring snapshot from the most recent LinkedIn scrape. `'unknown'` is
   * the projection's default for rows that never had it computed.
   */
  hiringStatus: boolean | 'unknown';
  /** Denormalized count of open job postings on this company. */
  openListingsCount: number;
};

/**
 * Investor row consumed by the results list + detail panel. Mirrors the
 * `investors.searchForMap` projection — see that query for the source of
 * each field.
 */
export type InvestorForList = {
  _id: Id<'investors'>;
  name: string;
  slug: string;
  website?: string;
  globalHq?: string;
  location?: {
    rawAddress: string;
    city?: string;
    region?: string;
    country?: string;
  };
  lng: number;
  lat: number;
  investorType?: string;
  investmentThesis?: string;
  firstChequeMin?: number;
  firstChequeMax?: number;
  countriesOfInvestment: string[];
  stagesOfInvestment: string[];
};

/**
 * List-panel discriminated union. The card and detail components branch on
 * `kind` to pick the right renderer. Selecting an entity by id pulls from
 * this list (so the detail can reflect the latest data without an extra fetch).
 */
export type EntityForList =
  | ({ kind: 'company' } & CompanyForList)
  | ({ kind: 'investor' } & InvestorForList);

export type FilteredCompanies = {
  /** Companies subset (back-compat for callers that only care about companies). */
  companies: CompanyForList[];
  /** Investors subset. Empty array when `filters.types` excludes investors. */
  investors: InvestorForList[];
  /** Mixed list — companies first, then investors. Order subject to design. */
  entities: EntityForList[];
  /** Map-source-ready FeatureCollection. Stable identity across renders. */
  geojson: FeatureCollection<Point, EntityFeatureProps>;
};

/**
 * Reactively subscribes to `companies.searchForMap` and (when investors are
 * enabled in the filter) `investors.searchForMap`, then merges both into a
 * single GeoJSON FeatureCollection (for `map.getSource(...).setData()`) and
 * a single discriminated `entities` list (for the results sidebar).
 *
 * Sharing one merged result between the map and the list keeps the two views
 * in lockstep — the marker count and the card count always agree because
 * they're projected from the same row set.
 *
 * Conditionally skips each underlying query when its kind isn't in
 * `filters.types` (so toggling investors off costs nothing on the wire).
 *
 * Returns `undefined` while any active query is loading.
 */
export function useFilteredCompanies(
  filters: MapFilters = EMPTY_FILTERS,
): FilteredCompanies | undefined {
  const wantsCompanies = filters.types.includes('company');
  const wantsInvestors = filters.types.includes('investor');

  // Build the Convex args object, omitting empty arrays so the query path
  // can short-circuit ("no constraint on that dimension").
  const companyArgs = useMemo(
    () => ({
      q: filters.q.trim() || undefined,
      sectors: filters.sectors.length ? filters.sectors : undefined,
      stages: filters.stages.length ? filters.stages : undefined,
      employeeCounts: filters.employeeCounts.length
        ? filters.employeeCounts
        : undefined,
      cities: filters.cities.length ? filters.cities : undefined,
      // Convex stores hiringStatus as `boolean | 'unknown'`; the URL/UI
      // uses string IDs. Translate at the boundary so the wire format
      // matches the doc shape.
      hiringStatuses: filters.hiringStatuses.length
        ? filters.hiringStatuses.map(hiringFilterIdToStatus)
        : undefined,
    }),
    [
      filters.q,
      filters.sectors,
      filters.stages,
      filters.employeeCounts,
      filters.cities,
      filters.hiringStatuses,
    ],
  );

  const investorArgs = useMemo(
    () => ({
      q: filters.q.trim() || undefined,
      // Translate filter IDs → raw OpenVC strings here so the Convex query
      // stays a pure doc-shape comparison and doesn't need the taxonomy.
      types: filters.investorTypes.length
        ? filters.investorTypes.map((id) => INVESTOR_TYPE_TO_RAW[id])
        : undefined,
      stages: filters.investorStages.length
        ? filters.investorStages.map((id) => INVESTOR_STAGE_TO_RAW[id])
        : undefined,
      // Cheque bucket IDs → numeric ranges. Open-ended top bucket caps at
      // MAX_SAFE_INTEGER because Infinity doesn't round-trip cleanly via
      // JSON; the query treats it as effectively unbounded.
      chequeRanges: filters.chequeBuckets.length
        ? filters.chequeBuckets.map((id) => {
            const b = CHEQUE_BUCKETS.find((x) => x.id === id)!;
            return {
              min: b.min,
              max: Number.isFinite(b.max) ? b.max : Number.MAX_SAFE_INTEGER,
            };
          })
        : undefined,
      countries: filters.investorCountries.length
        ? filters.investorCountries
        : undefined,
    }),
    [
      filters.q,
      filters.investorTypes,
      filters.investorStages,
      filters.chequeBuckets,
      filters.investorCountries,
    ],
  );

  const companyRows = useQuery(
    api.companies.searchForMap,
    wantsCompanies ? companyArgs : 'skip',
  );
  const investorRows = useQuery(
    api.investors.searchForMap,
    wantsInvestors ? investorArgs : 'skip',
  );

  return useMemo(() => {
    // Wait for every active subscription before painting — avoids a flash
    // where companies render alone for a frame before investors arrive.
    if (wantsCompanies && companyRows === undefined) return undefined;
    if (wantsInvestors && investorRows === undefined) return undefined;

    const companies = wantsCompanies ? (companyRows ?? []) : [];
    const investors = wantsInvestors ? (investorRows ?? []) : [];

    const entities: EntityForList[] = [
      ...companies.map((c) => ({ kind: 'company' as const, ...c })),
      ...investors.map((i) => ({ kind: 'investor' as const, ...i })),
    ];

    const features: FeatureCollection<Point, EntityFeatureProps>['features'] = [];
    let idx = 0;
    for (const c of companies) {
      features.push({
        type: 'Feature',
        id: idx++, // numeric id required by setFeatureState
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: {
          kind: 'company',
          _id: c._id,
          name: c.name,
          slug: c.slug,
          sector: c.sector,
          website: c.website,
        },
      });
    }
    for (const i of investors) {
      features.push({
        type: 'Feature',
        id: idx++,
        geometry: { type: 'Point', coordinates: [i.lng, i.lat] },
        properties: {
          kind: 'investor',
          _id: i._id,
          name: i.name,
          slug: i.slug,
          investorType: i.investorType,
          website: i.website,
        },
      });
    }

    return {
      companies,
      investors,
      entities,
      geojson: { type: 'FeatureCollection', features },
    };
  }, [wantsCompanies, wantsInvestors, companyRows, investorRows]);
}
