'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from 'convex/react';
import { FunnelIcon } from '@heroicons/react/24/outline';
import { api } from '@/convex/_generated/api';
import {
  EMPLOYEE_COUNT_IDS,
  HIRING_STATUS_IDS,
  SECTOR_IDS,
  STAGE_IDS,
  type EmployeeCountId,
  type HiringStatusFilterId,
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
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent } from '@/components/ui/tooltip';

type Option<Id extends string> = { id: Id; name: string };

const SEARCH_DEBOUNCE_MS = 250;

interface FilterBarProps {
  /** "sm" for the floating chrome bar; "md" inside the sidebar. */
  size?: 'sm' | 'md';
  /** Autofocus the search field on mount. Used when the sidebar opens. */
  autoFocusSearch?: boolean;
}

/**
 * Search input + a filter-icon toggle that reveals multi-select filter
 * chips below. Reads/writes URL search params via
 * `?q=&sector=&stage=&employees=&city=` so the same source of truth
 * drives both the floating chrome bar and the results sidebar.
 *
 * The chip row defaults to open whenever any filter is already active —
 * a fresh load with `?sector=fintech` shows its chip without a click. The
 * row animates open/closed via the standard grid `0fr → 1fr` track-height
 * trick so chips stay mounted across the toggle (preserves popover state).
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
  const hiringOptions = useMemo<Option<HiringStatusFilterId>[]>(
    () =>
      HIRING_STATUS_IDS.map((id) => ({ id, name: tTax(`hiringStatuses.${id}`) })),
    [tTax],
  );

  // City options come from data, not a closed enum, so they're loaded
  // reactively. The Convex query is scoped to the full published set —
  // unaffected by the user's other filter selections — so the dropdown
  // stays stable as filters compose. Display label includes the count
  // ("Lehi (12)") to surface where the dense markets are; the `id` is
  // the lowercase city key, the same shape the Convex filter uses.
  const cityList = useQuery(api.companies.cityList);
  const cityOptions = useMemo<Option<string>[]>(
    () =>
      (cityList ?? []).map((c) => ({
        id: c.key,
        name: `${c.display} (${c.count})`,
      })),
    [cityList],
  );

  // Sum across all filter dimensions. Drives the toggle's count badge
  // and the initial-open default (so a `?sector=fintech` deep link lands
  // with chips already visible).
  const activeCount =
    filters.sectors.length +
    filters.stages.length +
    filters.employeeCounts.length +
    filters.cities.length +
    filters.hiringStatuses.length;

  // `chipsOpen` is initialized once from `activeCount`, then becomes
  // user-controlled — toggling URL filters off later doesn't yank the
  // chip row closed mid-interaction.
  const [chipsOpen, setChipsOpen] = useState(activeCount > 0);

  const toggleLabel = chipsOpen
    ? tFilters('toggle.hide')
    : tFilters('toggle.show');

  return (
    <div className="flex flex-col">
      {/* Top row: search + filter toggle. Search is fixed-width so the
          toggle button stays anchored to the right edge regardless of
          search content; flex-nowrap so they never wrap. */}
      <div className="flex flex-nowrap items-center gap-2">
        <div className="w-[380px] shrink-0">
          <SearchField
            aria-label={tFilters('search.placeholder')}
            value={draftQ}
            onChange={setDraftQ}
            autoFocus={autoFocusSearch}
          >
            <SearchInput placeholder={tFilters('search.placeholder')} />
          </SearchField>
        </div>
        <Tooltip>
          <Button
            aria-label={toggleLabel}
            aria-pressed={chipsOpen}
            intent="outline"
            // sq-md is 44px (mobile) / 36px (desktop) — matches the
            // SearchInput's `min-h-11 sm:min-h-9` exactly so the toggle
            // sits flush with the input on both breakpoints regardless
            // of the `size` prop. (`size` here only affects chip sizing.)
            size="sq-md"
            onPress={() => setChipsOpen((open) => !open)}
            className="relative shrink-0"
          >
            <FunnelIcon />
            {activeCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-1 text-[10px] font-semibold text-bg"
              >
                {activeCount}
              </span>
            )}
          </Button>
          <TooltipContent>{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>

      {/* Chip row reveal: same `0fr → 1fr` grid trick used for the
          floating result panel. Chips stay mounted across the toggle so
          their popover state survives, and clipping is handled by the
          inner wrapper's `min-h-0 overflow-hidden`. */}
      <div
        className={[
          'grid transition-[grid-template-rows] duration-200 ease-out',
          chipsOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
        aria-hidden={!chipsOpen}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Chip order is alphabetical by label (City, Employees,
              Hiring, Sector, Stage). If a label is renamed in i18n,
              double-check the row still reads in order. */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <FilterChip
              size={size}
              label={tFilters('city.label')}
              options={cityOptions}
              value={filters.cities}
              onChange={(cities) => updateFilters({ ...filters, cities })}
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
            <FilterChip
              size={size}
              label={tFilters('hiring.label')}
              options={hiringOptions}
              value={filters.hiringStatuses}
              onChange={(hiringStatuses) =>
                updateFilters({ ...filters, hiringStatuses })
              }
            />
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
          </div>
        </div>
      </div>
    </div>
  );
}
