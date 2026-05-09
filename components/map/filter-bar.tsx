'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from 'convex/react';
import { FunnelIcon, RectangleStackIcon } from '@heroicons/react/24/outline';
import { Button as AriaButton } from 'react-aria-components/Button';
import { Dialog } from 'react-aria-components/Dialog';
import { DialogTrigger } from 'react-aria-components/Dialog';
import { Popover as PopoverPrimitive } from 'react-aria-components/Popover';
import { twMerge } from 'tailwind-merge';
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
  DEFAULT_ENTITY_TYPES,
  ENTITY_TYPE_IDS,
  isTypesNonDefault,
  parseFiltersFromParams,
  serializeFiltersToParams,
  type EntityTypeId,
  type MapFilters,
} from '@/lib/companies/filters';
import { SearchField, SearchInput } from '@/components/ui/search-field';
import { FilterChip } from '@/components/ui/filter-chip';
import { ListBox, ListBoxItem } from '@/components/ui/list-box';
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

  // Layer counts for the Layers popover labels. Both are cheap and Convex
  // shares the underlying subscription with the map page, so subscribing
  // here costs nothing extra.
  const companyTotal = useQuery(api.companies.mapTotalCount);
  const investorTotal = useQuery(api.investors.mapTotalCount);
  const layerOptions = useMemo<Option<EntityTypeId>[]>(
    () =>
      ENTITY_TYPE_IDS.map((id) => {
        const total = id === 'company' ? companyTotal : investorTotal;
        const base = tFilters(`type.options.${id}`);
        return {
          id,
          name: total != null ? `${base} (${formatThousands(total)})` : base,
        };
      }),
    [tFilters, companyTotal, investorTotal],
  );

  // Sum across the *filter* dimensions only. Layer selection is now its
  // own affordance (the Layers button) with its own badge — keeping it out
  // of this count means the Filter button reflects "narrowing" and the
  // Layers button reflects "what's on the map", with no overlap.
  const activeCount =
    filters.sectors.length +
    filters.stages.length +
    filters.employeeCounts.length +
    filters.cities.length +
    filters.hiringStatuses.length;
  const typesDiverges = isTypesNonDefault(filters.types);

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
            // `md` matches the SearchInput at the desktop breakpoint
            // (`min-h-9`); the explicit `min-h-11` keeps the mobile
            // height aligned with the input's `min-h-11` so the toggle
            // sits flush with the input on both breakpoints.
            size="md"
            onPress={() => setChipsOpen((open) => !open)}
            className="relative shrink-0 min-h-11 sm:min-h-9"
          >
            <FunnelIcon />
            <span>{tFilters('toggle.label')}</span>
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
        {/* Layers button: orthogonal to filters. Filters narrow what's
            shown within a layer; layers control which kinds (companies,
            investors) are visible at all. Badge appears only when the
            layer state diverges from the default so a fresh load stays
            unadorned. */}
        <DialogTrigger>
          <AriaButton
            aria-label={tFilters('layers.label')}
            className={twMerge(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-md border bg-bg shadow-sm transition-colors min-h-11 sm:min-h-9 px-3.5 text-sm',
              'pressed:bg-muted hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              typesDiverges
                ? 'border-fg/40 bg-fg/5 font-medium'
                : 'border-border',
            )}
          >
            <RectangleStackIcon className="size-4" />
            <span>{tFilters('layers.label')}</span>
            {typesDiverges && (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-fg px-1 text-[10px] font-semibold text-bg"
              >
                {filters.types.length}
              </span>
            )}
          </AriaButton>
          <PopoverPrimitive
            offset={6}
            placement="bottom end"
            className={twMerge(
              'overflow-hidden rounded-xl shadow-lg',
              'entering:animate-in entering:fade-in-0 entering:zoom-in-95',
              'exiting:animate-out exiting:fade-out-0 exiting:zoom-out-95',
            )}
          >
            <Dialog className="outline-none">
              <ListBox
                aria-label={tFilters('layers.label')}
                selectionMode="multiple"
                selectedKeys={filters.types}
                // Empty selection falls back to the default
                // (`['company']`) so the map never goes blank — toggling
                // every layer off would otherwise be a usability dead-end.
                onSelectionChange={(keys) => {
                  const next =
                    keys === 'all'
                      ? [...ENTITY_TYPE_IDS]
                      : (Array.from(keys) as EntityTypeId[]);
                  updateFilters({
                    ...filters,
                    types: next.length > 0 ? next : DEFAULT_ENTITY_TYPES,
                  });
                }}
                items={layerOptions}
              >
                {(item) => (
                  <ListBoxItem id={item.id} textValue={item.name}>
                    {item.name}
                  </ListBoxItem>
                )}
              </ListBox>
            </Dialog>
          </PopoverPrimitive>
        </DialogTrigger>
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
              double-check the row still reads in order. Layer selection
              lives in the Layers button at the top of the chrome — these
              chips are purely about narrowing the visible set. */}
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

/**
 * "2545" → "2,545". Locale-agnostic; we don't need full Intl machinery for
 * this single label and it'd add weight to the bundle.
 */
function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}
