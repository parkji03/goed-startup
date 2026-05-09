'use client';

import { ArrowTopRightOnSquareIcon, SparklesIcon } from '@heroicons/react/20/solid';
import { useFormatter, useTranslations } from 'next-intl';
import {
  Disclosure,
  DisclosurePanel,
  DisclosureTrigger,
} from '@/components/ui/disclosure-group';
import type { InvestorBrief as InvestorBriefData } from '@/lib/companies/investor-brief';

interface InvestorSourcesProps {
  brief: InvestorBriefData | undefined;
  className?: string;
  style?: React.CSSProperties;
}

type SourceItem = {
  /** Translated section label this quote backs (e.g., "Funding"). */
  fieldLabel: string;
  /** Optional second line under the label (e.g., the founder's name). */
  context?: string;
  quote: string;
};

/**
 * Bottom-of-profile audit trail for the AI-extracted brief. Aggregates every
 * `sourceQuote` from the brief's nested fields, plus the crawl provenance
 * (extracted date + pages crawled). Returns null when nothing to show, so
 * companies with curated-only data don't grow an empty section.
 *
 * Quotes live here (not inline next to each field) to keep the brief itself
 * scannable for investors and to give the verification surface a single,
 * predictable home.
 */
export function InvestorSources({ brief, className, style }: InvestorSourcesProps) {
  const t = useTranslations('Map.detail.sources');
  const tBrief = useTranslations('Map.detail.brief');
  const format = useFormatter();

  if (!brief) return null;

  const items = collectSources(brief, t);
  const dateText = brief.extractedAt
    ? format.dateTime(new Date(brief.extractedAt), {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;
  const pages = brief.pagesCrawled?.filter((p) => p.trim()) ?? [];

  if (items.length === 0 && !dateText && pages.length === 0) return null;

  return (
    <section className={className ?? ''} style={style} aria-label={t('eyebrow')}>
      {/* Disclosure wraps the entire section so the audit trail collapses
          out of the way until an investor actively wants to verify. The
          trigger reuses the AI sparkle eyebrow with a chevron at the end;
          panel content slides open. Default-closed (Disclosure's default
          isExpanded). Outside a DisclosureGroup, the wrapper's CSS vars
          fall through to transparent / 0-radius so no card chrome appears. */}
      <Disclosure>
        <DisclosureTrigger
          triggerIndicator
          className="cursor-pointer items-center gap-3 px-0 py-0 font-normal text-current"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-subtle-fg">
            <SparklesIcon className="size-3" aria-hidden="true" />
          </span>
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-subtle-fg">
            {t('eyebrow')}
          </span>
          <span aria-hidden="true" className="h-px flex-1 bg-border" />
        </DisclosureTrigger>
        <DisclosurePanel className="px-0">
          {items.length > 0 && (
            <ul className="mt-1 flex flex-col gap-3">
              {items.map((item, i) => (
                <li
                  key={`${item.fieldLabel}-${i}`}
                  className="rounded-lg border border-border/70 bg-muted/30 p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-fg">
                      {item.fieldLabel}
                    </span>
                    {item.context && (
                      <span className="text-right text-[11px] leading-snug text-fg/80 break-words">
                        {item.context}
                      </span>
                    )}
                  </div>
                  <blockquote className="mt-1.5 text-xs italic leading-relaxed text-fg/85">
                    “{item.quote}”
                  </blockquote>
                </li>
              ))}
            </ul>
          )}

          {/* Crawled pages — link list, opens in new tab. Mono so URLs are
              legible at a glance. */}
          {pages.length > 0 && (
            <div className="mt-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-fg">
                {t('crawledPages')}
              </span>
              <ul className="mt-2 flex flex-col gap-1">
                {pages.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex max-w-full items-start gap-1.5 rounded text-[11px] text-muted-fg transition-colors hover:text-fg focus-visible:text-fg focus-visible:outline-none"
                    >
                      <span className="font-mono break-all">{url}</span>
                      <ArrowTopRightOnSquareIcon
                        className="size-3 shrink-0 translate-y-[3px] opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
                        aria-hidden="true"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer — when this brief was extracted. */}
          {dateText && (
            <p className="mt-3 text-[10px] text-muted-fg">
              {tBrief('extractedOn', { date: dateText })}
            </p>
          )}
        </DisclosurePanel>
      </Disclosure>
    </section>
  );
}

/**
 * Walk the brief and pull every `sourceQuote` into a flat list, paired with
 * a translated field label and (where useful) extra context like the founder
 * name or metric value. Empty quotes are skipped.
 */
function collectSources(
  brief: InvestorBriefData,
  t: ReturnType<typeof useTranslations<'Map.detail.sources'>>,
): SourceItem[] {
  const items: SourceItem[] = [];

  const fundingQuote = brief.funding?.sourceQuote?.trim();
  if (fundingQuote) {
    items.push({ fieldLabel: t('fields.funding'), quote: fundingQuote });
  }

  const edgeQuote = brief.differentiationClaim?.sourceQuote?.trim();
  if (edgeQuote) {
    items.push({ fieldLabel: t('fields.edge'), quote: edgeQuote });
  }

  for (const f of brief.founders ?? []) {
    const q = f.sourceQuote?.trim();
    if (q) {
      items.push({
        fieldLabel: t('fields.founder'),
        context: f.name,
        quote: q,
      });
    }
  }

  for (const m of brief.keyMetrics ?? []) {
    const q = m.sourceQuote?.trim();
    if (q) {
      items.push({
        fieldLabel: t('fields.metric'),
        context: `${m.value} ${m.metric}`,
        quote: q,
      });
    }
  }

  return items;
}
