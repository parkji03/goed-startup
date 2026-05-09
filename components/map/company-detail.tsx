'use client';

import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  BriefcaseIcon,
  GlobeAltIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from '@heroicons/react/20/solid';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from 'convex/react';
import { Button } from 'react-aria-components/Button';
import { api } from '@/convex/_generated/api';
import type { CompanyForList } from '@/hooks/useFilteredCompanies';
import { Link } from '@/i18n/navigation';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';
import { SECTOR_TINTS } from '@/lib/companies/sector-styling';
import { CompanyPhotosStrip } from '@/components/map/company-photos-strip';
import { InvestorBrief } from '@/components/map/investor-brief';
import { InvestorSources } from '@/components/map/investor-sources';

// Hero banner removed — sector identity now lives entirely in the small
// pill next to the logo, and the domain lives in the Links chip.

interface CompanyDetailProps {
  company: CompanyForList;
  onBack: () => void;
  onView: (company: CompanyForList) => void;
}

/**
 * Investor-facing detail view for a single company. Replaces the native
 * mapboxgl.Popup. Lives inside the floating panel, so it inherits the panel's
 * width and scroll behavior. Sticky footer keeps the two CTAs reachable
 * regardless of description length.
 */
export function CompanyDetail({ company, onBack, onView }: CompanyDetailProps) {
  const tTax = useTranslations('Taxonomy');
  const tDetail = useTranslations('Map.detail');
  const tCard = useTranslations('Map.card');
  const tCta = useTranslations('MapCta');

  const domain = domainFromUrl(company.website);
  const logoSmall = logoDevUrl(domain, { size: 128 });
  const tint = SECTOR_TINTS[company.sector];

  // Soft entrance — animate every section in on mount, with a small stagger.
  // Resets whenever the company changes so navigating between detail views
  // re-plays the choreography.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [company._id]);

  const enterClass = [
    'transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100',
    entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
  ].join(' ');
  const enterStyle = (delay: number): React.CSSProperties => ({
    transitionDelay: `${delay}ms`,
  });

  // Lazy-fetch listings only when this detail view is mounted. Keeps the
  // map's `searchForMap` payload lean — listings can be 5+ rows per company,
  // which would otherwise bloat every subscription update across the corpus.
  const listings = useQuery(api.companies.listingsForCompany, {
    companyId: company._id,
  });

  const stats: Array<{ label: string; value: string | null }> = [
    { label: tDetail('stats.stage'),     value: company.stage ? tTax(`stages.${company.stage}`) : null },
    { label: tDetail('stats.employees'), value: company.employeeCount ? tTax(`employeeCounts.${company.employeeCount}`) : null },
    { label: tDetail('stats.founded'),   value: company.yearFounded ? String(company.yearFounded) : null },
    { label: tDetail('stats.sector'),    value: tTax(`sectors.${company.sector}`) },
  ];

  return (
    <div className="@container relative flex flex-col">
      {/* Sticky header — stays put while the user scrolls through long
          descriptions. Translucent so the hero gradient peeks through. */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/60 bg-bg/85 px-3 py-2 backdrop-blur-md">
        <Button
          type="button"
          onPress={onBack}
          aria-label={tDetail('back')}
          className="grid size-8 place-items-center rounded-full text-fg/70 transition-colors hover:bg-muted hover:text-fg focus-visible:bg-muted focus-visible:text-fg focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-4" />
        </Button>
        <span className="truncate text-xs font-medium uppercase tracking-[0.14em] text-muted-fg">
          {tDetail('eyebrow')}
        </span>
      </div>

      {/* Scrollable body — bottom padding leaves room for the sticky CTA bar. */}
      <div className="flex-1 px-4 pb-28 pt-4">
        {/* Identity row — logo on the left, title + sector pill stacked
            in the middle, quick-access icon links anchored top-right.
            Logo fills its square edge-to-edge (no inner padding). */}
        <div className={enterClass} style={enterStyle(0)}>
          <div className="flex items-start gap-4">
            <div className="size-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-bg shadow-sm">
              {logoSmall ? (
                // eslint-disable-next-line @next/next/no-img-element -- per-domain dynamic image, can't use next/image
                <img
                  src={logoSmall}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center text-xl font-semibold text-fg/70">
                  {company.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
                {company.name}
              </h2>
              <span
                className={[
                  'mt-1.5 inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]',
                  tint.pill,
                ].join(' ')}
              >
                {tTax(`sectors.${company.sector}`)}
              </span>
            </div>
            <div
              className="-me-1 flex shrink-0 items-center gap-0.5"
              aria-label={tDetail('sections.links')}
            >
              {company.website && (
                <IconLink
                  href={company.website}
                  label={domain ?? tCard('website')}
                  icon={<GlobeAltIcon className="size-4" />}
                />
              )}
              {company.linkedin && (
                <IconLink
                  href={company.linkedin}
                  label="LinkedIn"
                  icon={<LinkedInGlyph className="size-4" />}
                />
              )}
              {company.isClaimed ? (
                // Static pill (no link) — signals ownership has been
                // verified by GOED. Emerald reads as "good standing"
                // without introducing a new design token.
                <span className="ms-1 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  <ShieldCheckIcon className="size-3.5" aria-hidden />
                  {tCta('claimedBadge')}
                </span>
              ) : (
                <Link
                  href={`/claim/${company.slug}`}
                  className="ms-1 inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-fg/80 transition-colors hover:border-fg/30 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <ShieldCheckIcon className="size-3.5" aria-hidden />
                  {tCta('claimThisCompany')}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Full street address — replaces the old city/state line. */}
        {company.location.rawAddress && (
          <p
            className={`${enterClass} mt-3 flex items-start gap-1.5 font-mono text-xs leading-relaxed text-muted-fg`}
            style={enterStyle(60)}
          >
            <MapPinIcon className="size-3.5 shrink-0 translate-y-[1px]" />
            <span>{company.location.rawAddress}</span>
          </p>
        )}

        {/* Description — comfortable body type, no truncation. */}
        {company.description && (
          <p
            className={`${enterClass} mt-4 text-sm leading-relaxed text-fg/85`}
            style={enterStyle(120)}
          >
            {company.description}
          </p>
        )}

        {/* Owner-uploaded photos. Component self-suppresses when the
            company has none, so no need to gate here. Click a thumbnail
            to open the full-size lightbox. */}
        <CompanyPhotosStrip
          companyId={company._id}
          className={`${enterClass} mt-4`}
          style={enterStyle(150)}
        />

        {/* Information block — editorial divider then a 2x2 mono stat grid.
            The mono numerals + uppercase labels code "data" instantly.
            Lives above the AI brief because these are curated, trusted facts. */}
        {stats.some((s) => s.value) && (
          <div className={`${enterClass} mt-7`} style={enterStyle(180)}>
            <SectionLabel>{tDetail('sections.information')}</SectionLabel>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 @sm:grid-cols-4">
              {stats.map((s) =>
                s.value ? (
                  <div key={s.label} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-fg">
                      {s.label}
                    </dt>
                    <dd className="mt-1 truncate font-mono text-sm font-medium text-fg">
                      {s.value}
                    </dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        )}

        {/* Open roles — pulled from the LinkedIn scrape and persisted in the
            companyJobPostings table. Self-suppresses when empty so we don't
            stamp an empty section under "Information". */}
        {listings && listings.length > 0 && (
          <div className={`${enterClass} mt-7`} style={enterStyle(220)}>
            <SectionLabel>
              {tDetail('openRoles.eyebrow', { count: listings.length })}
            </SectionLabel>
            <ul className="mt-3 divide-y divide-border/60 rounded-2xl border border-border bg-bg/50">
              {listings.map((l) => (
                <li key={l._id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                  >
                    <BriefcaseIcon className="size-4 shrink-0 text-muted-fg" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                      {l.title}
                    </span>
                    <ArrowTopRightOnSquareIcon className="size-3.5 shrink-0 text-muted-fg" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI-extracted investor brief — sits below the curated info so the
            trusted facts render first. The component self-suppresses when
            empty, so no need to guard it here. */}
        <InvestorBrief
          brief={company.investorBrief}
          className={`${enterClass} mt-7`}
          style={enterStyle(240)}
        />

        {/* Bottom-of-profile audit trail — collected source quotes and the
            crawl provenance for the AI brief. Self-suppresses when no
            quotes/pages exist. */}
        <InvestorSources
          brief={company.investorBrief}
          className={`${enterClass} mt-8`}
          style={enterStyle(300)}
        />

      </div>

      {/* Sticky CTA bar — primary action is "Visit website", secondary is
          "View on map". The "Claim this company" link lives in the header
          when the row hasn't been claimed yet. */}
      <div className="pointer-events-none sticky bottom-0 z-10 mt-auto px-3 pb-3">
        <div className="pointer-events-auto flex items-stretch gap-2 rounded-2xl border border-border bg-bg/95 p-1.5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <Button
            type="button"
            onPress={() => onView(company)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <MapPinIcon className="size-4" />
            {tCard('viewOnMap')}
          </Button>
          {company.website ? (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-fg shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {tDetail('visitWebsite')}
              <ArrowTopRightOnSquareIcon className="size-3.5 opacity-90" />
            </a>
          ) : (
            <span className="inline-flex flex-1 items-center justify-center rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-fg">
              {tDetail('noWebsite')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-fg">
        {children}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
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
      className="grid size-8 place-items-center rounded-full text-muted-fg transition-colors hover:bg-muted hover:text-fg focus-visible:bg-muted focus-visible:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {icon}
    </a>
  );
}

function LinkedInGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14ZM8.34 18V9.94H5.67V18h2.67ZM7 8.83a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1ZM18.34 18v-4.4c0-2.55-1.36-3.74-3.18-3.74-1.46 0-2.12.8-2.49 1.36V9.94h-2.67c.04.75 0 8.06 0 8.06h2.67v-4.5c0-.24.02-.48.09-.65.18-.48.61-.97 1.34-.97.94 0 1.32.71 1.32 1.76V18h2.92Z" />
    </svg>
  );
}

