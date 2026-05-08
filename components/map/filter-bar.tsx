'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  EMPLOYEE_COUNT_IDS,
  SECTOR_IDS,
  STAGE_IDS,
  type EmployeeCountId,
  type SectorId,
  type StageId,
} from '@/lib/companies/taxonomy';
import {
  parseFiltersFromParams,
  serializeFiltersToParams,
  type MapFilters,
} from '@/lib/companies/filters';
import { SearchField, SearchInput } from '@/components/ui/search-field';
import { FilterChip } from '@/components/ui/filter-chip';

type Option<Id extends string> = { id: Id; name: string };

const SEARCH_DEBOUNCE_MS = 250;

interface FilterBarProps {
  /** "sm" for the floating chrome bar; "md" inside the sidebar. */
  size?: 'sm' | 'md';
  /** Autofocus the search field on mount. Used when the sidebar opens. */
  autoFocusSearch?: boolean;
}

/**
 * Search input + 3 multi-select filter chips. Reads/writes URL search
 * params via `?q=&sector=&stage=&employees=` so the same source of truth
 * drives both the floating chrome bar and the results sidebar.
 *
 * The search input is locally controlled with a 250ms debounce — fast
 * typing doesn't fire a Convex subscription per keystroke.
 */
export function FilterBar({
  size = 'md',
  autoFocusSearch = false,
}: FilterBarProps) {
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
  // Sync draft when URL changes externally (Clear all, back/forward).
  // Storing the last-seen URL value during render avoids the cascading-
  // render trap of doing this in useEffect.
  const [lastUrlQ, setLastUrlQ] = useState(filters.q);
  if (filters.q !== lastUrlQ) {
    setLastUrlQ(filters.q);
    setDraftQ(filters.q);
  }

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

  return (
    // Single-row layout. Search has a fixed width so it never resizes
    // when chips grow (e.g. a count badge appears); the chrome around
    // this bar is auto-sized to fit, so the whole pill grows wider
    // instead of compressing the input. flex-nowrap so the chips
    // never get pushed onto a second line.
    <div className="flex flex-nowrap items-center gap-2">
      <div className="w-[300px] shrink-0">
        <SearchField
          aria-label={tFilters('search.placeholder')}
          value={draftQ}
          onChange={setDraftQ}
          autoFocus={autoFocusSearch}
        >
          <SearchInput placeholder={tFilters('search.placeholder')} />
        </SearchField>
      </div>
      <FilterChip
        size={size}
        label={tFilters('sector.label')}
        options={sectorOptions}
        value={filters.sectors}
        onChange={(sectors) => updateFilters({ ...filters, sectors })}
      />
      <FilterChip
        size={size}
        label={tFilters('stage.label')}
        options={stageOptions}
        value={filters.stages}
        onChange={(stages) => updateFilters({ ...filters, stages })}
      />
      <FilterChip
        size={size}
        label={tFilters('employees.label')}
        options={employeeOptions}
        value={filters.employeeCounts}
        onChange={(employeeCounts) =>
          updateFilters({ ...filters, employeeCounts })
        }
      />
    </div>
  );
}
