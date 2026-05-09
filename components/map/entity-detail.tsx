'use client';

import type { EntityForList } from '@/hooks/useFilteredCompanies';
import { CompanyDetail } from './company-detail';
import { InvestorDetail } from './investor-detail';

interface EntityDetailProps {
  entity: EntityForList;
  onBack: () => void;
  onView: (entity: EntityForList) => void;
}

/**
 * Thin dispatcher that picks the right detail panel for the selected entity.
 * Kept separate from each detail component so the company/investor views
 * remain independently editable — they share no fields, no data, no
 * provenance, so dragging shared layout into one giant component would just
 * generate cross-cutting branches.
 */
export function EntityDetail({ entity, onBack, onView }: EntityDetailProps) {
  if (entity.kind === 'company') {
    return (
      <CompanyDetail
        company={entity}
        onBack={onBack}
        onView={() => onView(entity)}
      />
    );
  }
  return (
    <InvestorDetail
      investor={entity}
      onBack={onBack}
      onView={() => onView(entity)}
    />
  );
}
