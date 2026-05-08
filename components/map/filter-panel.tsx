'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from 'react-aria-components/Button';
import {
  EMPLOYEE_COUNT_IDS,
  SECTOR_IDS,
  STAGE_IDS,
  isEmployeeCountId,
  isSectorId,
  isStageId,
  type EmployeeCountId,
  type SectorId,
  type StageId,
} from '@/lib/companies/taxonomy';
import {
  isFiltersActive,
  parseFiltersFromParams,
  serializeFiltersToParams,
  type MapFilters,
} from '@/lib/companies/filters';
import { SearchField, SearchInput } from '@/components/ui/search-field';
import {
  MultipleSelect,
  MultipleSelectContent,
  MultipleSelectItem,
} from '@/components/ui/multiple-select';

type Option<Id extends string> = { id: Id; name: string };

const SEARCH_DEBOUNCE_MS = 250;

type FilterPanelProps = {
  /** Number of companies currently rendered on the map. */
  shown: number;
  /** Total number of mappable companies (denominator). */
  total: number;
};

/**
 * Floating filter panel for the map. Drives URL state via
 * `?q=&sector=&stage=&employees=` so views are shareable. The map page
 * reads the same URL and passes filters into `useCompaniesGeoJson`, so
 * this component only needs to write — there's no internal source of
 * truth, just URL ⇄ component.
 *
 * Search input is locally controlled with a 250ms debounce before pushing
 * to the URL: typing fast doesn't hammer the router or fire a Convex
 * subscription per keystroke.
 */
export function FilterPanel({ shown, total }: FilterPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tFilters = useTranslations('Map.filters');
  const tTax = useTranslations('Taxonomy');

  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );

  // Stable ref to filters so the debounce effect doesn't re-create the
  // timer every time a non-q field changes.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const updateFilters = useCallback(
    (next: MapFilters) => {
      const qs = serializeFiltersToParams(next);
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router],
  );

  // Local "draft" search value for instant typing feel; debounced before
  // pushing to the URL.
  const [draftQ, setDraftQ] = useState(filters.q);
  // When the URL value changes externally (e.g. Clear all, back/forward),
  // pull it into the draft. Storing the last-seen URL value during render
  // is the React-docs-endorsed pattern for syncing on prop changes
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders);
  // it avoids the cascading-render trap of doing this in useEffect.
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q);
    setDraftQ(filters.q);
  }

  // Debounced URL push. No-op when the draft already matches the URL —
  // including the moment the URL change feeds back into draftQ above.
  useEffect(() => {
    if (draftQ === filtersRef.current.q) return;
    const timer = setTimeout(() => {
      updateFilters({ ...filtersRef.current, q: draftQ });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftQ, updateFilters]);

  const sectorOptions = useMemo<Option<SectorId>[]>(
    () => SECTOR_IDS.map((id) => ({ id, name: tTax(`sectors.${id}`) })),
    [tTax],
  );
  const stageOptions = useMemo<Option<StageId>[]>(
    () => STAGE_IDS.map((id) => ({ id, name: tTax(`stages.${id}`) })),
    [tTax],
  );
  const employeeOptions = useMemo<Option<EmployeeCountId>[]>(
    () =>
      EMPLOYEE_COUNT_IDS.map((id) => ({ id, name: tTax(`employeeCounts.${id}`) })),
    [tTax],
  );

  const onClearAll = () =>
    updateFilters({ q: '', sectors: [], stages: [], employeeCounts: [] });

  const active = isFiltersActive(filters);

  return (
    <div className="fixed left-3 top-[70px] z-10 w-[340px] rounded-xl border border-border bg-bg/95 p-3 shadow-lg backdrop-blur-md max-md:left-2 max-md:right-2 max-md:w-auto">
      <div className="flex flex-col gap-3">
        <SearchField
          aria-label={tFilters('search.placeholder')}
          value={draftQ}
          onChange={setDraftQ}
        >
          <SearchInput placeholder={tFilters('search.placeholder')} />
        </SearchField>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-fg">
            {tFilters('sector.label')}
          </label>
          <MultipleSelect
            aria-label={tFilters('sector.label')}
            placeholder={tFilters('sector.placeholder')}
            searchPlaceholder={tFilters('sector.searchPlaceholder')}
            value={filters.sectors}
            onChange={(keys) =>
              updateFilters({
                ...filters,
                sectors: keys.map(String).filter(isSectorId),
              })
            }
          >
            <MultipleSelectContent items={sectorOptions}>
              {(item) => (
                <MultipleSelectItem id={item.id} textValue={item.name}>
                  {item.name}
                </MultipleSelectItem>
              )}
            </MultipleSelectContent>
          </MultipleSelect>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-fg">
            {tFilters('stage.label')}
          </label>
          <MultipleSelect
            aria-label={tFilters('stage.label')}
            placeholder={tFilters('stage.placeholder')}
            searchPlaceholder={tFilters('stage.searchPlaceholder')}
            value={filters.stages}
            onChange={(keys) =>
              updateFilters({
                ...filters,
                stages: keys.map(String).filter(isStageId),
              })
            }
          >
            <MultipleSelectContent items={stageOptions}>
              {(item) => (
                <MultipleSelectItem id={item.id} textValue={item.name}>
                  {item.name}
                </MultipleSelectItem>
              )}
            </MultipleSelectContent>
          </MultipleSelect>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-fg">
            {tFilters('employees.label')}
          </label>
          <MultipleSelect
            aria-label={tFilters('employees.label')}
            placeholder={tFilters('employees.placeholder')}
            searchPlaceholder={tFilters('employees.searchPlaceholder')}
            value={filters.employeeCounts}
            onChange={(keys) =>
              updateFilters({
                ...filters,
                employeeCounts: keys.map(String).filter(isEmployeeCountId),
              })
            }
          >
            <MultipleSelectContent items={employeeOptions}>
              {(item) => (
                <MultipleSelectItem id={item.id} textValue={item.name}>
                  {item.name}
                </MultipleSelectItem>
              )}
            </MultipleSelectContent>
          </MultipleSelect>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-fg">
          <span aria-live="polite">
            {tFilters('resultsCount', { shown, total })}
          </span>
          {active && (
            <Button
              type="button"
              onPress={onClearAll}
              className="rounded text-fg underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {tFilters('clear')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
