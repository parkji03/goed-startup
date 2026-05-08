'use client';

import { GlobeAltIcon, MapPinIcon } from '@heroicons/react/20/solid';
import { useTranslations } from 'next-intl';
import { Button } from 'react-aria-components/Button';
import type { CompanyForList } from '@/hooks/useFilteredCompanies';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';

interface CompanyCardProps {
  company: CompanyForList;
  onView: (company: CompanyForList) => void;
}

/**
 * Single result card in the sidebar list. Click anywhere on the card
 * (except the LinkedIn/Website links) to fly the map to the company.
 */
export function CompanyCard({ company, onView }: CompanyCardProps) {
  const tTax = useTranslations('Taxonomy');
  const tCard = useTranslations('Map.card');

  const logoUrl = logoDevUrl(domainFromUrl(company.website), { size: 96 });
  const cityState = formatCityState(company.location);
  const subline = formatSubline(company, tTax, tCard);

  return (
    <article
      className="group relative w-full cursor-pointer rounded-lg border border-border bg-bg p-3 text-left transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
      onClick={() => onView(company)}
    >
      <div className="flex items-start gap-3">
        {/* Logo */}
        <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-bg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo.dev returns dynamic per-domain images, can't use next/image
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-contain"
            />
          ) : (
            <div className="grid size-full place-items-center text-sm font-semibold">
              {company.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Meta column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-fg">
              {company.name}
            </h3>
            <SectorPill sector={tTax(`sectors.${company.sector}`)} />
          </div>

          {subline && (
            <p className="mt-0.5 text-xs text-muted-fg">{subline}</p>
          )}

          {company.description && (
            <p className="mt-2 line-clamp-2 text-sm text-fg/80">
              {company.description}
            </p>
          )}

          {cityState && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-fg">
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">{cityState}</span>
            </p>
          )}

          {/* Footer actions — stop propagation so opening a link doesn't
              also fly the map. */}
          <div
            className="mt-2 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {company.website && (
              <IconLink
                href={company.website}
                label={tCard('website')}
                icon={<GlobeAltIcon className="size-4" />}
              />
            )}
            {company.linkedin && (
              <IconLink
                href={company.linkedin}
                label={tCard('linkedin')}
                icon={<LinkedInIcon className="size-4" />}
              />
            )}
            <Button
              type="button"
              onPress={() => onView(company)}
              className="ml-auto rounded text-xs font-medium text-fg/80 underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {tCard('viewOnMap')}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

function SectorPill({ sector }: { sector: string }) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-fg">
      {sector}
    </span>
  );
}

function IconLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded text-muted-fg transition-colors hover:bg-muted hover:text-fg focus-visible:bg-muted focus-visible:text-fg focus-visible:outline-none"
    >
      {icon}
    </a>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.34 18V9.94H5.67V18h2.67ZM7 8.83a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1ZM18.34 18v-4.4c0-2.55-1.36-3.74-3.18-3.74-1.46 0-2.12.8-2.49 1.36V9.94h-2.67c.04.75 0 8.06 0 8.06h2.67v-4.5c0-.24.02-.48.09-.65.18-.48.61-.97 1.34-.97.94 0 1.32.71 1.32 1.76V18h2.92Z" />
    </svg>
  );
}

function formatCityState(loc: CompanyForList['location']): string | null {
  const city = loc.city?.trim();
  const state = loc.state?.trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  // Fall back to the raw address if it's reasonably short. Long ones look
  // crowded inside the card; short ones are usually city-only entries.
  const raw = loc.rawAddress?.trim();
  return raw && raw.length < 60 ? raw : null;
}

function formatSubline(
  company: CompanyForList,
  tTax: (key: string) => string,
  tCard: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  const parts: string[] = [];
  if (company.stage) parts.push(tTax(`stages.${company.stage}`));
  if (company.employeeCount) {
    parts.push(
      tCard('employeesValue', {
        count: tTax(`employeeCounts.${company.employeeCount}`),
      }),
    );
  }
  if (company.yearFounded) {
    parts.push(tCard('foundedValue', { year: company.yearFounded }));
  }
  return parts.length ? parts.join(' · ') : null;
}
