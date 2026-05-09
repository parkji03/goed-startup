'use client';

import { GlobeAltIcon, MapPinIcon } from '@heroicons/react/20/solid';
import { useTranslations } from 'next-intl';
import { Button } from 'react-aria-components/Button';
import type { InvestorForList } from '@/hooks/useFilteredCompanies';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';

interface InvestorCardProps {
  investor: InvestorForList;
  /** Body click — opens the in-panel detail view. */
  onSelect: () => void;
  /** Explicit "View on map" link — pans + zooms the map. */
  onView: () => void;
}

/**
 * Sidebar card for an investor row. Mirrors `CompanyCard` visually so the
 * mixed list reads as one family — same logo box, same icon-link footer,
 * same "View on map" affordance — with three differences:
 *
 *  • The logo container is a rounded square (matches the square map marker)
 *    rather than the company card's rounded square (same shape today; this
 *    is intentionally redundant so future shape tweaks stay in sync with
 *    the marker).
 *  • The pill in the corner shows the OpenVC investor type instead of a
 *    company sector.
 *  • The subline shows cheque size + countries-of-investment count instead
 *    of stage/employees/founded.
 */
export function InvestorCard({ investor, onSelect, onView }: InvestorCardProps) {
  const tCard = useTranslations('Map.card');
  const tInvestor = useTranslations('Map.investor');

  const logoUrl = logoDevUrl(domainFromUrl(investor.website), { size: 96 });
  const subline = formatSubline(investor, tInvestor);
  const hqLabel = formatHq(investor);

  return (
    <article
      // Left accent rail in OpenVC's brand magenta (#ff007e) — the same hex
      // used in the logo we credit at the bottom of the investor profile.
      // 4px stripe doubles as the "this is an investor" tell, paired with
      // the rounded-square map marker. Standard 1px border on the other
      // three sides keeps the card chrome quiet.
      className="group relative w-full cursor-pointer rounded-lg border border-border border-l-4 border-l-[#ff007e]/70 bg-bg p-3 text-left transition-colors hover:bg-muted/40 focus-within:bg-muted/40"
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        {/* Logo — rounded square box, same dimensions as the company logo
            box. Future: bump corner radius further if we want the card to
            telegraph "investor" the same way the map marker does. */}
        <div className="size-10 shrink-0 overflow-hidden rounded-md border border-border bg-bg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- per-domain dynamic image, can't use next/image
            <img
              src={logoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-contain"
            />
          ) : (
            <div className="grid size-full place-items-center text-sm font-semibold">
              {investor.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* Meta column */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-sm font-semibold text-fg">
              {investor.name}
            </h3>
            {investor.investorType && (
              <TypePill label={investor.investorType} />
            )}
          </div>

          {subline && (
            <p className="mt-0.5 text-xs text-muted-fg">{subline}</p>
          )}

          {investor.investmentThesis && (
            <p className="mt-2 line-clamp-2 text-sm text-fg/80">
              {investor.investmentThesis}
            </p>
          )}

          {hqLabel && (
            <p className="mt-2 flex items-center gap-1 text-xs text-muted-fg">
              <MapPinIcon className="size-3.5 shrink-0" />
              <span className="truncate">{hqLabel}</span>
            </p>
          )}

          {/* Footer actions — stop propagation so opening a link doesn't
              also fly the map. */}
          <div
            className="mt-2 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {investor.website && (
              <IconLink
                href={investor.website}
                label={tCard('website')}
                icon={<GlobeAltIcon className="size-4" />}
              />
            )}
            <Button
              type="button"
              onPress={onView}
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

function TypePill({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-fg">
      {label}
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

/**
 * "$10K – $200K · 13 countries". Surfaces the most operational data point
 * (cheque size) above the geographic breadth — that's what a founder
 * scanning the list needs first.
 */
function formatSubline(
  investor: InvestorForList,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  const parts: string[] = [];
  const cheque = formatChequeRange(
    investor.firstChequeMin,
    investor.firstChequeMax,
  );
  if (cheque) parts.push(cheque);
  if (investor.countriesOfInvestment.length > 0) {
    parts.push(
      t('countriesValue', { count: investor.countriesOfInvestment.length }),
    );
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Formats currency range like "$10K – $200K" or "$1M – $14M". Returns null
 * when both ends are missing (the common "no info" case).
 */
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

function formatHq(investor: InvestorForList): string | null {
  const city = investor.location?.city?.trim();
  const country = investor.location?.country?.trim();
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  const raw = investor.globalHq?.trim();
  return raw && raw.length < 60 ? raw : null;
}
