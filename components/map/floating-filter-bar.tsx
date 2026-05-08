'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from 'react-aria-components/Button';
import {
  isFiltersActive,
  parseFiltersFromParams,
  serializeFiltersToParams,
} from '@/lib/companies/filters';
import type { CompanyForList } from '@/hooks/useFilteredCompanies';
import { CompanyList } from './company-list';
import { FilterBar } from './filter-bar';

interface FloatingFilterBarProps {
  /** When true, the panel grows downward to show the result list. */
  panelOpen: boolean;
  companies: CompanyForList[] | undefined;
  total: number;
  shown: number;
  onView: (company: CompanyForList) => void;
}

// Pinned width for both states. Sized to fit the search input plus
// three filter chips on a single row (with badges for any selected
// values), so the chrome never reflows when the panel toggles.
const CHROME_WIDTH = 'w-[560px]';

/**
 * The single floating chrome on the map. Always pinned top-left,
 * always visible, never blocks the map's panning interactions outside
 * its own footprint.
 *
 * Two visual states, both driven by `panelOpen`:
 *
 *   • Collapsed (`!panelOpen`): a pill-shaped row that holds the
 *     search input and three filter chips. Single row.
 *
 *   • Expanded (`panelOpen`): same width and same FilterBar at the
 *     top, but the surface becomes a rounded card and grows downward
 *     to render the "Showing X of Y" status row plus a scrollable
 *     list of company cards. Capped so the map below stays usable.
 *
 * The FilterBar is intentionally rendered in the same JSX position
 * in both states — only its sibling list section is conditional —
 * so React keeps the same FilterBar instance mounted across the
 * toggle. Search input, draft text, focus, and chip popover states
 * all survive the transition.
 */
export function FloatingFilterBar({
  panelOpen,
  companies,
  total,
  shown,
  onView,
}: FloatingFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tFilters = useTranslations('Map.filters');

  const filters = parseFiltersFromParams(searchParams);
  const active = isFiltersActive(filters);

  const onClearAll = () => {
    const next = { q: '', sectors: [], stages: [], employeeCounts: [] };
    const qs = serializeFiltersToParams(next);
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  };

  return (
    <div
      className={[
        'fixed left-3 top-[70px] z-10 flex flex-col overflow-hidden border border-border bg-bg/95 shadow-lg backdrop-blur-md',
        CHROME_WIDTH,
        // Same outer max so the box never spills off-screen on narrower
        // viewports; mobile collapses to edge-to-edge.
        'max-w-[calc(100vw-1.5rem)] max-md:left-2 max-md:right-2 max-md:w-auto max-md:max-w-none',
        // Border radius is the only shape change between states. The
        // pill in the collapsed state matches the rounded-2xl card's
        // top half visually, so the FilterBar reads as the same
        // surface across both.
        panelOpen ? 'rounded-2xl' : 'rounded-full',
      ].join(' ')}
    >
      {/* The FilterBar lives at the same JSX position in both states.
          Padding stays consistent so the bar's internal layout never
          shifts when the panel toggles. */}
      <div className="px-2.5 py-1.5">
        <FilterBar size="sm" />
      </div>

      {panelOpen && (
        <>
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-fg">
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

          <div className="max-h-[calc(70vh-130px)] overflow-y-auto border-t border-border">
            <CompanyList companies={companies} onView={onView} />
          </div>
        </>
      )}
    </div>
  );
}
