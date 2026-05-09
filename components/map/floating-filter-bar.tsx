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
import { CompanyDetail } from './company-detail';
import { CompanyList } from './company-list';
import { FilterBar } from './filter-bar';

interface FloatingFilterBarProps {
  /** When true, the panel grows downward to show the result list (or detail). */
  panelOpen: boolean;
  companies: CompanyForList[] | undefined;
  total: number;
  shown: number;
  /** Currently-selected company; when set, the panel shows the detail view
   * instead of the list. */
  selected: CompanyForList | null;
  onSelect: (company: CompanyForList) => void;
  onClearSelection: () => void;
  onView: (company: CompanyForList) => void;
}

// Width is content-driven. The search input has a fixed width, the
// chips grow naturally when a count badge appears, and the chrome
// just sizes to fit them all on a single row — so selecting a
// filter expands the chrome rather than compressing the input.

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
  selected,
  onSelect,
  onClearSelection,
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
        'fixed left-3 top-[70px] z-10 flex w-fit flex-col overflow-hidden border border-border bg-bg/95 shadow-lg backdrop-blur-md',
        // Cap at 700px so the chrome doesn't grow unbounded as filters
        // and badges stack up; the inner viewport-safety bound keeps it
        // from spilling off-screen on narrower windows. Mobile
        // collapses to edge-to-edge.
        'max-w-[min(700px,calc(100vw-1.5rem))] max-md:left-2 max-md:right-2 max-md:w-auto max-md:max-w-none',
        // Single fixed corner radius. `rounded-full` reads as a pill
        // at the FilterBar's collapsed height, but its 9999px value
        // gets clamped to half-min-dimension per frame — animating
        // the height while the corners interpolate produced a giant
        // bulging arc mid-transition. `rounded-2xl` (16px) reads as
        // a soft card at every height without that artifact.
        'rounded-2xl',
        // Animate the auto width when chip badges add or drop. Only
        // takes effect in browsers that honor `interpolate-size`
        // (set on :root in globals.css); elsewhere this is a no-op
        // and the width snaps as before.
        'transition-[width] duration-200 ease-out',
      ].join(' ')}
    >
      {/* The FilterBar lives at the same JSX position in both states.
          Padding stays consistent so the bar's internal layout never
          shifts when the panel toggles. */}
      <div className="px-2.5 py-1.5">
        <FilterBar size="sm" />
      </div>

      {/* Result panel reveals via the grid `0fr → 1fr` trick — the
       * track height transitions while content stays at its natural
       * size. `min-h-0 overflow-hidden` on the inner wrapper clips
       * whatever's beyond the current track height, so the cards
       * appear naturally as the panel grows down. Content stays
       * mounted across the toggle so the collapse animation has
       * something to fold up; while collapsed, the list receives
       * `undefined` and renders its lightweight skeleton (clipped
       * out of view anyway). */}
      <div
        className={[
          'grid transition-[grid-template-rows] duration-200 ease-out',
          panelOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        ].join(' ')}
        aria-hidden={!panelOpen}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Status row hides while a detail is open — the detail has its own
              header and the count would just be visual noise behind it. */}
          {!selected && (
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
          )}

          {/* Inner scroll height = viewport minus the panel's top offset
              (70px), the FilterBar (~64px), the optional status row (~36px),
              and a 12px bottom safety margin. ~180px of chrome total. */}
          <div className="max-h-[calc(100vh-180px)] overflow-y-auto border-t border-border">
            {selected ? (
              <CompanyDetail
                company={selected}
                onBack={onClearSelection}
                onView={onView}
              />
            ) : (
              <CompanyList
                companies={panelOpen ? companies : undefined}
                onSelect={onSelect}
                onView={onView}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
