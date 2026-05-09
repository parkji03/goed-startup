'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { EntityForList } from '@/hooks/useFilteredCompanies';
import { CompanyCard } from './company-card';
import { InvestorCard } from './investor-card';

interface EntityListProps {
  entities: EntityForList[] | undefined;
  onSelect: (entity: EntityForList) => void;
  onView: (entity: EntityForList) => void;
}

const PAGE_SIZE = 30;

/** Walk up the DOM to find the nearest scrollable ancestor (overflow auto/scroll). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll') return parent;
    parent = parent.parentElement;
  }
  return null;
}

/**
 * Scrollable list of entity cards in the results sidebar. Same windowed
 * pseudo-virtualization as the old company-only list — defers DOM work for
 * the long tail (especially relevant once investors are toggled on:
 * thousands of rows, ~30 mounted at a time).
 *
 * Dispatches per row to a kind-specific card. Selecting a row from either
 * card type bubbles the entity back up unchanged so the parent's selection
 * state stays kind-agnostic.
 */
export function EntityList({ entities, onSelect, onView }: EntityListProps) {
  const tList = useTranslations('Map.list');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset the window whenever the result set changes (new query/filter).
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [entities]);

  const total = entities?.length ?? 0;
  const hasMore = visible < total;

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = findScrollParent(sentinel);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE_SIZE, total));
        }
      },
      { root, rootMargin: '200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, total]);

  if (entities === undefined) {
    return (
      <div className="flex flex-col gap-2 p-3" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[120px] animate-pulse rounded-lg border border-border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-fg">{tList('emptyTitle')}</p>
        <p className="mt-1 text-xs text-muted-fg">{tList('emptyHint')}</p>
      </div>
    );
  }

  const windowed = entities.slice(0, visible);

  return (
    <ul className="flex flex-col gap-2 p-3" role="list">
      {windowed.map((entity) =>
        entity.kind === 'company' ? (
          <li key={entity._id}>
            <CompanyCard
              company={entity}
              onSelect={() => onSelect(entity)}
              onView={() => onView(entity)}
            />
          </li>
        ) : (
          <li key={entity._id}>
            <InvestorCard
              investor={entity}
              onSelect={() => onSelect(entity)}
              onView={() => onView(entity)}
            />
          </li>
        ),
      )}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </ul>
  );
}
