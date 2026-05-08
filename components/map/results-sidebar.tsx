'use client';

import { ChevronLeftIcon } from '@heroicons/react/20/solid';
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

interface ResultsSidebarProps {
  companies: CompanyForList[] | undefined;
  total: number;
  shown: number;
  onView: (company: CompanyForList) => void;
  onCollapse: () => void;
}

/**
 * Left sidebar that opens whenever a filter or search is active. Shares
 * the FilterBar with the floating chrome bar (collapsed state); adds the
 * "Showing X of Y / Clear all" status row and a scrollable list of cards.
 *
 * Manual collapse is exposed via the trailing edge button — it just
 * notifies the parent which sets `manuallyCollapsed`. The sidebar will
 * re-open automatically when the next filter change happens.
 */
export function ResultsSidebar({
  companies,
  total,
  shown,
  onView,
  onCollapse,
}: ResultsSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tFilters = useTranslations('Map.filters');
  const tNav = useTranslations('Map.nav');

  const filters = parseFiltersFromParams(searchParams);
  const active = isFiltersActive(filters);

  const onClearAll = () => {
    const next = { q: '', sectors: [], stages: [], employeeCounts: [] };
    const qs = serializeFiltersToParams(next);
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url, { scroll: false });
  };

  return (
    <aside
      className="fixed bottom-0 left-0 top-[58px] z-20 flex w-[400px] flex-col border-r border-border bg-bg shadow-xl"
      aria-label={tNav('sidebarLabel')}
    >
      <div className="border-b border-border p-3">
        <FilterBar size="md" autoFocusSearch />
      </div>

      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-fg">
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <CompanyList companies={companies} onView={onView} />
      </div>

      {/* Trailing edge collapse button. Pinned to the right border so it
          stays visible when the user scrolls the list. */}
      <Button
        type="button"
        onPress={onCollapse}
        aria-label={tNav('collapseSidebar')}
        className="absolute right-[-12px] top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg text-muted-fg shadow hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeftIcon className="size-4" />
      </Button>
    </aside>
  );
}
