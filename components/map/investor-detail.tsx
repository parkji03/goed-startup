'use client';

import {
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
  GlobeAltIcon,
  MapPinIcon,
} from '@heroicons/react/20/solid';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from 'react-aria-components/Button';
import type { InvestorForList } from '@/hooks/useFilteredCompanies';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';

interface InvestorDetailProps {
  investor: InvestorForList;
  onBack: () => void;
  onView: () => void;
}

/**
 * Founder-facing detail view for a single investor. Shares structural
 * patterns with `CompanyDetail` (sticky header, scrollable body, sticky CTA
 * bar) but surfaces only investor-shaped data — no sector/stage/employee
 * facets, no listings, no AI brief.
 */
export function InvestorDetail({
  investor,
  onBack,
  onView,
}: InvestorDetailProps) {
  const tDetail = useTranslations('Map.detail');
  const tCard = useTranslations('Map.card');
  const tInvestor = useTranslations('Map.investor');

  const domain = domainFromUrl(investor.website);
  const logoSmall = logoDevUrl(domain, { size: 128 });

  // Soft entrance choreography — same as company detail so navigating
  // between the two doesn't feel like switching apps.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    setEntered(false);
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [investor._id]);

  const enterClass = [
    'transition-all duration-500 ease-out motion-reduce:transition-none motion-reduce:translate-y-0 motion-reduce:opacity-100',
    entered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
  ].join(' ');
  const enterStyle = (delay: number): React.CSSProperties => ({
    transitionDelay: `${delay}ms`,
  });

  const cheque = formatChequeRange(
    investor.firstChequeMin,
    investor.firstChequeMax,
  );

  const stats: Array<{ label: string; value: string | null }> = [
    { label: tInvestor('stats.type'), value: investor.investorType ?? null },
    { label: tInvestor('stats.cheque'), value: cheque },
    {
      label: tInvestor('stats.countries'),
      value:
        investor.countriesOfInvestment.length > 0
          ? String(investor.countriesOfInvestment.length)
          : null,
    },
    {
      label: tInvestor('stats.stages'),
      value:
        investor.stagesOfInvestment.length > 0
          ? String(investor.stagesOfInvestment.length)
          : null,
    },
  ];

  return (
    <div className="@container relative flex flex-col">
      {/* Sticky header. Eyebrow says "Investor profile" so the user knows
          what kind of card they're on without reading the type pill. */}
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
          {tInvestor('eyebrow')}
        </span>
      </div>

      <div className="flex-1 px-4 pb-28 pt-4">
        {/* Identity row. Logo container is a rounded square (not full circle)
            to match the square map marker — visual continuity from pin to
            panel. */}
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
                  {investor.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
                {investor.name}
              </h2>
              {investor.investorType && (
                <span className="mt-1.5 inline-block rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-fg">
                  {investor.investorType}
                </span>
              )}
            </div>
            {investor.website && (
              <div className="-me-1 flex shrink-0 items-center gap-0.5">
                <IconLink
                  href={investor.website}
                  label={domain ?? tCard('website')}
                  icon={<GlobeAltIcon className="size-4" />}
                />
              </div>
            )}
          </div>
        </div>

        {/* HQ — full address */}
        {investor.globalHq && (
          <p
            className={`${enterClass} mt-3 flex items-start gap-1.5 font-mono text-xs leading-relaxed text-muted-fg`}
            style={enterStyle(60)}
          >
            <MapPinIcon className="size-3.5 shrink-0 translate-y-[1px]" />
            <span>{investor.globalHq}</span>
          </p>
        )}

        {/* Investment thesis — long form, no truncation */}
        {investor.investmentThesis && (
          <p
            className={`${enterClass} mt-4 text-sm leading-relaxed text-fg/85`}
            style={enterStyle(120)}
          >
            {investor.investmentThesis}
          </p>
        )}

        {/* Stat block — type / cheque / countries count / stages count.
            Mirrors the company detail's 2x2 stat grid for visual rhyme. */}
        {stats.some((s) => s.value) && (
          <div className={`${enterClass} mt-7`} style={enterStyle(180)}>
            <SectionLabel>{tInvestor('sections.facts')}</SectionLabel>
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

        {/* Stages of investment — badges list. Source values keep their
            "1. Idea or Patent" form so the dataset is round-trippable to
            OpenVC; we strip the leading number for display. */}
        {investor.stagesOfInvestment.length > 0 && (
          <div className={`${enterClass} mt-7`} style={enterStyle(220)}>
            <SectionLabel>{tInvestor('sections.stages')}</SectionLabel>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {investor.stagesOfInvestment.map((s) => (
                <li
                  key={s}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-fg/80"
                >
                  {stripStagePrefix(s)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Countries of investment — long lists are realistic (some
            investors target 100+ countries). Cap at 24 visible with a
            "+N more" tail to keep the panel scannable. */}
        {investor.countriesOfInvestment.length > 0 && (
          <div className={`${enterClass} mt-7`} style={enterStyle(260)}>
            <SectionLabel>
              {tInvestor('sections.countriesWithCount', {
                count: investor.countriesOfInvestment.length,
              })}
            </SectionLabel>
            <CountryList countries={investor.countriesOfInvestment} />
          </div>
        )}

        {/* Attribution — every investor row originates from the OpenVC
            October 2025 export, so we credit them inline at the bottom of
            the profile. White pill background keeps the brand colors of the
            logo (black + magenta) legible in both light and dark themes
            without recoloring their mark. */}
        <div
          className={`${enterClass} mt-8 flex justify-center`}
          style={enterStyle(320)}
        >
          <a
            href="https://www.openvc.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-[11px] text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span>{tInvestor('attribution.prefix')}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG, no perf benefit from next/image and keeps brand colors as-authored */}
            <img
              src="/openvc-logo.svg"
              alt="OpenVC"
              width={68}
              height={17}
              className="h-[14px] w-auto"
            />
          </a>
        </div>
      </div>

      {/* Sticky CTA bar — same shape as company detail. */}
      <div className="pointer-events-none sticky bottom-0 z-10 mt-auto px-3 pb-3">
        <div className="pointer-events-auto flex items-stretch gap-2 rounded-2xl border border-border bg-bg/95 p-1.5 shadow-[0_4px_20px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md">
          <Button
            type="button"
            onPress={onView}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <MapPinIcon className="size-4" />
            {tCard('viewOnMap')}
          </Button>
          {investor.website ? (
            <a
              href={investor.website}
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

/** "1. Idea or Patent" → "Idea or Patent". Falls back to the original on miss. */
function stripStagePrefix(stage: string): string {
  return stage.replace(/^\d+\.\s*/, '').trim() || stage;
}

const COUNTRY_VISIBLE_CAP = 24;

function CountryList({ countries }: { countries: string[] }) {
  const tInvestor = useTranslations('Map.investor');
  const visible = countries.slice(0, COUNTRY_VISIBLE_CAP);
  const hidden = countries.length - visible.length;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {visible.map((c) => (
        <span
          key={c}
          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-fg"
        >
          {c}
        </span>
      ))}
      {hidden > 0 && (
        <span className="rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] font-medium text-muted-fg">
          {tInvestor('moreCount', { count: hidden })}
        </span>
      )}
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

function formatChequeRange(
  min: number | undefined,
  max: number | undefined,
): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null) {
    return `${formatUsdShort(min)} – ${formatUsdShort(max)}`;
  }
  if (min != null) return `≥ ${formatUsdShort(min)}`;
  return `≤ ${formatUsdShort(max!)}`;
}

function formatUsdShort(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `$${Math.round(n / 1_000)}K`;
  }
  return `$${n}`;
}
