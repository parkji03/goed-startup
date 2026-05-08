'use client';

import { useTranslations } from 'next-intl';
import type { CompanyForList } from '@/hooks/useFilteredCompanies';
import { CompanyCard } from './company-card';

interface CompanyListProps {
  companies: CompanyForList[] | undefined;
  onView: (company: CompanyForList) => void;
}

/**
 * Scrollable list of company cards in the results sidebar. Renders three
 * states: undefined (initial load → skeleton), empty (no matches), and
 * populated (the list).
 */
export function CompanyList({ companies, onView }: CompanyListProps) {
  const tList = useTranslations('Map.list');

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

  return (
    <ul className="flex flex-col gap-2 p-3" role="list">
      {companies.map((company) => (
        <li key={company._id}>
          <CompanyCard company={company} onView={onView} />
        </li>
      ))}
    </ul>
  );
}
