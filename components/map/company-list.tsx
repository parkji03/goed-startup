'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CompanyForList } from '@/hooks/useFilteredCompanies';
import { CompanyCard } from './company-card';

interface CompanyListProps {
  companies: CompanyForList[] | undefined;
  onSelect: (company: CompanyForList) => void;
  onView: (company: CompanyForList) => void;
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
 * Scrollable list of company cards in the results sidebar. Renders three
 * states: undefined (initial load → skeleton), empty (no matches), and
 * populated (the list).
 *
 * The populated list is windowed: it shows PAGE_SIZE cards at a time and
 * grows by PAGE_SIZE whenever a sentinel below the last card scrolls into
 * the parent scroll container. Cheap pseudo-virtualization — the full
 * dataset already lives in memory, this just defers DOM work.
 */
export function CompanyList({ companies, onSelect, onView }: CompanyListProps) {
  const tList = useTranslations('Map.list');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Reset the window whenever the result set changes (new query/filter).
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [companies]);

  const total = companies?.length ?? 0;
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

  if (companies === undefined) {
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

  if (companies.length === 0) {
    return (
      <div className="grid place-items-center px-6 py-12 text-center">
        <p className="text-sm font-medium text-fg">{tList('emptyTitle')}</p>
        <p className="mt-1 text-xs text-muted-fg">{tList('emptyHint')}</p>
      </div>
    );
  }

  const windowed = companies.slice(0, visible);

  return (
    <ul className="flex flex-col gap-2 p-3" role="list">
      {windowed.map((company) => (
        <li key={company._id}>
          <CompanyCard company={company} onSelect={onSelect} onView={onView} />
        </li>
      ))}
      {hasMore && <div ref={sentinelRef} aria-hidden="true" className="h-px" />}
    </ul>
  );
}
