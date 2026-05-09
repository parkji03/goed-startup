'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from 'react-aria-components/Button';
import {
  EMPTY_FILTERS,
  isFiltersActive,
  parseFiltersFromParams,
  serializeFiltersToParams,
} from '@/lib/companies/filters';
import type { EntityForList } from '@/hooks/useFilteredCompanies';
import { EntityDetail } from './entity-detail';
import { EntityList } from './entity-list';
import { FilterBar } from './filter-bar';

interface FloatingFilterBarProps {
  /** When true, the panel grows downward to show the result list (or detail). */
  panelOpen: boolean;
  entities: EntityForList[] | undefined;
  total: number;
  shown: number;
  /** Currently-selected entity; when set, the panel shows the detail view
   * instead of the list. */
  selected: EntityForList | null;
  onSelect: (entity: EntityForList) => void;
  onClearSelection: () => void;
  onView: (entity: EntityForList) => void;
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
  entities,
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
    const qs = serializeFiltersToParams(EMPTY_FILTERS);
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  };

  return (
    <div
      className={[
        'fixed left-3 top-[70px] z-10 flex flex-col overflow-hidden border border-border bg-bg/95 shadow-lg backdrop-blur-md',
        // Cap the entire panel at viewport-minus-top-offset (70px) minus a
        // 12px bottom safety margin. With this bound on the outer, the
        // inner scroll area uses `flex-1` to fill whatever's left after
        // the FilterBar — so the list never spills past the viewport
        // bottom regardless of how tall the FilterBar gets when chip
        // rows wrap. `100dvh` instead of `100vh` so iOS Safari's
        // dynamic toolbar doesn't push the bottom off-screen.
        'max-h-[calc(100dvh-82px)]',
        // At rest (panel closed), `w-fit` shrinks the chrome to its
        // natural content — search input + filter toggle + layers
        // toggle — capped so chip badges can't push it off-screen.
        // When the panel opens, lock to a fixed width so the result
        // list and the entity detail render at the *same* width.
        // (Don't keep `w-fit` here: with content that wraps, fit-content
        // grows to fill whatever max-width allows, defeating the lock.)
        //
        // The width is set by the top row's three controls:
        //   search 380 + gap 8 + filter ~100 + gap 8 + layers ~100 +
        //   px-2.5 padding 20 ≈ 616px → 648 leaves slack for the count
        //   badge that pops out of the Filter button's top-right corner.
        // Adjust both values together if another top-row control lands.
        // The viewport clamp keeps narrow windows safe; mobile drops
        // both bounds entirely.
        panelOpen
          ? 'w-[648px] max-w-[calc(100vw-1.5rem)]'
          : 'w-fit max-w-[min(700px,calc(100vw-1.5rem))]',
        'max-md:left-2 max-md:right-2 max-md:w-auto max-md:min-w-0 max-md:max-w-none',
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
          shifts when the panel toggles. `shrink-0` keeps it at its
          natural height so the panel below can `flex-1` into whatever
          space is left under the outer max-height cap. */}
      <div className="shrink-0 px-2.5 py-1.5">
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
       * out of view anyway).
       *
       * When open, this wrapper takes whatever vertical space is left
       * under the outer's max-height (via `flex-1 min-h-0`), and the
       * inner scroll area inside fills that bound. That keeps the
       * panel inside the viewport whether the FilterBar shows zero,
       * one, or two rows of chips. */}
      <div
        className={[
          'grid transition-[grid-template-rows] duration-200 ease-out',
          panelOpen ? 'grid-rows-[1fr] flex-1 min-h-0' : 'grid-rows-[0fr]',
        ].join(' ')}
        aria-hidden={!panelOpen}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">
          {/* Status row hides while a detail is open — the detail has its own
              header and the count would just be visual noise behind it. */}
          {!selected && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-fg">
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

          {/* Scrolls within whatever leftover height the outer cap allows.
              `flex-1 min-h-0` is the canonical "fill remaining flex space
              and let me scroll" pair — without `min-h-0`, flex children
              refuse to shrink below their content size and the scrollbar
              never appears. */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-border">
            {selected ? (
              <EntityDetail
                entity={selected}
                onBack={onClearSelection}
                onView={onView}
              />
            ) : (
              <EntityList
                entities={panelOpen ? entities : undefined}
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
