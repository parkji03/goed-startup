'use client';

import { useCallback, useMemo } from 'react';
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

/**
 * Floating filter panel for the map. Drives URL state via
 * `?q=&sector=&stage=&employees=` so views are shareable. The map page
 * reads the same URL and passes filters into `useCompaniesGeoJson`, so
 * this component only needs to write — there's no internal state.
 */
export function FilterPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tFilters = useTranslations('Map.filters');
  const tTax = useTranslations('Taxonomy');

  // Memoize on the URL string so the filters object is a stable reference
  // across identical-content renders.
  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );

  const updateFilters = useCallback(
    (next: MapFilters) => {
      const qs = serializeFiltersToParams(next);
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router],
  );

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
    <div
      // Fixed under the LocaleSwitcher header (top: 58); the map itself sits
      // at top: 58 too, so we add a small offset.
      className="fixed left-3 top-[70px] z-10 w-[340px] rounded-xl border border-border bg-bg/95 p-3 shadow-lg backdrop-blur-md max-md:left-2 max-md:right-2 max-md:w-auto"
    >
      <div className="flex flex-col gap-3">
        <SearchField
          aria-label={tFilters('search.placeholder')}
          value={filters.q}
          onChange={(q) => updateFilters({ ...filters, q })}
        >
          <SearchInput placeholder={tFilters('search.placeholder')} />
        </SearchField>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted-fg">
            {tFilters('sector.label')}
          </label>
          <MultipleSelect
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

        {active && (
          <Button
            type="button"
            onPress={onClearAll}
            className="self-end text-xs text-muted-fg hover:text-fg"
          >
            {tFilters('clear')}
          </Button>
        )}
      </div>
    </div>
  );
}
