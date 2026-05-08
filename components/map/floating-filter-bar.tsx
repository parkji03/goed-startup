'use client';

import { FilterBar } from './filter-bar';

/**
 * Pill-shaped filter chrome that floats over the map when the sidebar is
 * collapsed. Same `<FilterBar>` content as the sidebar's header — just
 * wrapped in a rounded floating container, sized down for the chip-row
 * style.
 */
export function FloatingFilterBar() {
  return (
    <div className="fixed left-3 top-[70px] z-10 flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-border bg-bg/95 p-1.5 pl-2.5 shadow-lg backdrop-blur-md max-md:left-2 max-md:right-2 max-md:max-w-none">
      <FilterBar size="sm" />
    </div>
  );
}
