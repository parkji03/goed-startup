'use client';

import { InformationCircleIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  hasInvestorContent,
  sanitizeBrief,
  type Founder,
  type Funding,
  type InvestorBrief as InvestorBriefData,
} from '@/lib/companies/investor-brief';

interface InvestorBriefProps {
  brief: InvestorBriefData | undefined;
  /**
   * Optional className passed to the outermost container. Used by the parent
   * detail panel to plug into its entrance-animation choreography.
   */
  className?: string;
  style?: React.CSSProperties;
}

/**
 * AI-extracted investor brief. Single container so the AI provenance signal
 * fires once (gradient ring + sparkle eyebrow) instead of per-field. Optional
 * sub-sections render only when their data is present — if the entire brief
 * is empty, the component returns null.
 *
 * Source quotes and crawl provenance live in a separate `<InvestorSources />`
 * section at the bottom of the profile so the brief itself stays scannable.
 */
export function InvestorBrief({ brief, className, style }: InvestorBriefProps) {
  const t = useTranslations('Map.detail.brief');
  const tTax = useTranslations('Taxonomy');
  const format = useFormatter();

  if (!hasInvestorContent(brief)) return null;
  // sanitizeBrief strips LLM placeholder strings ("Unable to determine...",
  // "Unknown", etc.) so each section's `data.x && ...` guard works correctly.
  // Non-null because hasInvestorContent ran the same sanitization and returned
  // true, which requires at least one populated field.
  const data = sanitizeBrief(brief)!;

  const fundingDisplay = formatFunding(data.funding, format, t);
  const modelDisplay = formatModel(data.targetMarket, data.monetizationModel, tTax, t);

  const stats: Array<{
    label: string;
    primary: string | null;
    secondary?: string | null;
  }> = [
    {
      label: t('stats.funding'),
      primary: fundingDisplay.primary,
      secondary: fundingDisplay.secondary,
    },
    {
      label: t('stats.founders'),
      primary: data.founders && data.founders.length
        ? format.number(data.founders.length)
        : null,
    },
    {
      label: t('stats.model'),
      primary: modelDisplay,
    },
  ];

  const visibleStats = stats.filter((s) => s.primary);

  return (
    <section
      className={[
        'relative overflow-hidden rounded-2xl p-px',
        // Subtle gradient ring — primary on one corner, info on the other.
        // The 1px outer wrapper holds the gradient; the inner div carries
        // the surface fill so the gradient reads as a border, not a fill.
        'bg-gradient-to-br from-primary/40 via-primary/10 to-info-subtle-fg/30',
        'dark:from-primary/30 dark:via-primary/5 dark:to-info-subtle-fg/20',
        className ?? '',
      ].join(' ')}
      style={style}
      aria-label={t('eyebrow')}
    >
      <div className="rounded-[15px] bg-bg/95 p-4 backdrop-blur-sm">
        {/* Eyebrow row — sparkle + label + info tooltip */}
        <div className="flex items-center gap-2">
          <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary-subtle-fg">
            <SparklesIcon className="size-3" aria-hidden="true" />
          </span>
          <span className="flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-subtle-fg">
            {t('eyebrow')}
          </span>
          <Tooltip delay={300}>
            <TooltipTrigger
              className="grid size-5 place-items-center rounded-full text-muted-fg transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none"
              aria-label={t('aiTooltip')}
            >
              <InformationCircleIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-[240px] text-xs leading-relaxed">
                {t('aiTooltip')}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Hero pitch — pull quote treatment */}
        {data.pitch && (
          <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-base leading-snug text-fg">
            “{data.pitch}”
          </blockquote>
        )}

        {/* 2-column stat grid. Two cells per row gives each value ~2× the
            horizontal room of a four-column layout. Values wrap onto a
            second line when they're long ("Series A (or later equity) ·
            $53M"); short ones still fit on a single line — but we never
            let content spill into a neighbor column.
            `min-w-0` on the cell + `break-words` on the value cooperate
            so a single long token (rare, e.g. a 30-char investor name)
            also won't overflow. */}
        {visibleStats.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4">
            {visibleStats.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-fg">
                  {s.label}
                </dt>
                <dd className="mt-1 break-words font-mono text-sm font-semibold leading-snug text-fg">
                  {s.primary}
                </dd>
                {s.secondary && (
                  <dd className="mt-0.5 break-words text-[11px] leading-snug text-muted-fg">
                    {s.secondary}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        )}

        {/* Key metrics — chip row, mono numerals dominate */}
        {data.keyMetrics && data.keyMetrics.length > 0 && (
          <div className="mt-5">
            <SectionLabel>{t('sections.metrics')}</SectionLabel>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.keyMetrics.map((m, i) => (
                <li
                  key={`${m.metric}-${i}`}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs"
                >
                  <span className="font-mono font-semibold text-fg">{m.value}</span>
                  <span className="text-muted-fg">{m.metric}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Differentiation claim — short callout, distinct from pitch */}
        {data.differentiationClaim && (
          <div className="mt-5">
            <SectionLabel>{t('sections.edge')}</SectionLabel>
            <p className="mt-2 text-sm leading-relaxed text-fg/90">
              {data.differentiationClaim.claim}
            </p>
          </div>
        )}

        {/* Founding team */}
        {data.founders && data.founders.length > 0 && (
          <div className="mt-5">
            <SectionLabel>{t('sections.team')}</SectionLabel>
            <ul className="mt-2 flex flex-col gap-2">
              {data.founders.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <FounderRow
                    founder={f}
                    titleFallback={t('founderTitleFallback')}
                    priorAtTemplate={(companies) =>
                      t('priorAt', { companies })
                    }
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Notable customers */}
        {data.notableCustomers && data.notableCustomers.length > 0 && (
          <div className="mt-5">
            <SectionLabel>{t('sections.customers')}</SectionLabel>
            <TagRow items={data.notableCustomers} />
          </div>
        )}

        {/* Integrations */}
        {data.integrations && data.integrations.length > 0 && (
          <div className="mt-5">
            <SectionLabel>{t('sections.integrations')}</SectionLabel>
            <TagRow items={data.integrations} />
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-pieces
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-fg">
      {children}
    </span>
  );
}

function FounderRow({
  founder,
  titleFallback,
  priorAtTemplate,
}: {
  founder: Founder;
  titleFallback: string;
  priorAtTemplate: (companies: string) => string;
}) {
  const title = founder.title?.trim() || titleFallback;
  const priors = founder.priorCompanies?.filter((p) => p.trim());
  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <span className="font-medium text-fg">
        {founder.name}
        <span className="text-muted-fg"> · {title}</span>
      </span>
      {priors && priors.length > 0 && (
        <span className="text-xs text-muted-fg">
          {priorAtTemplate(priors.join(', '))}
        </span>
      )}
    </div>
  );
}

function TagRow({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <li
          key={`${item}-${i}`}
          className="rounded-full border border-border bg-bg px-2.5 py-0.5 text-xs text-fg/85"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatFunding(
  funding: Funding | undefined,
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<'Map.detail.brief'>>,
): { primary: string | null; secondary: string | null } {
  if (!funding) return { primary: null, secondary: null };
  const { round, amountUsd, leadInvestor } = funding;
  const amountStr = amountUsd != null ? formatCompactUsd(amountUsd, format) : null;

  let primary: string | null = null;
  if (round && amountStr) {
    primary = t('fundingAmount', { round, amount: amountStr });
  } else if (round) {
    primary = t('fundingRoundOnly', { round });
  } else if (amountStr) {
    primary = t('fundingAmountOnly', { amount: amountStr });
  }

  const secondary = leadInvestor ? t('fundingLed', { investor: leadInvestor }) : null;
  return { primary, secondary };
}

/**
 * Format a USD amount as a compact display string (no leading $) — the i18n
 * template prepends the symbol so RTL/locale flips keep the $ in the right
 * spot. Picks "1.2M" / "850K" / "12K" automatically.
 */
function formatCompactUsd(
  amountUsd: number,
  format: ReturnType<typeof useFormatter>,
): string {
  return format.number(amountUsd, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}

function formatModel(
  targetMarket: InvestorBriefData['targetMarket'],
  monetizationModel: InvestorBriefData['monetizationModel'],
  tTax: ReturnType<typeof useTranslations<'Taxonomy'>>,
  t: ReturnType<typeof useTranslations<'Map.detail.brief'>>,
): string | null {
  const market = targetMarket ? tTax(`targetMarkets.${targetMarket}`) : null;
  const model = monetizationModel
    ? tTax(`monetizationModels.${monetizationModel}`)
    : null;
  if (market && model) return t('modelLine', { market, model });
  return market ?? model ?? null;
}

