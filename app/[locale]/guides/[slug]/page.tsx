import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { GuideDetailClient } from "@/components/guides/guide-detail-client";
import { GuideDetailSkeleton } from "@/components/guides/guide-detail-skeleton";
import { guideCategoryLabel, type GuideCategoryKey } from "@/lib/guides/categories";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL, truncateForMeta } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

async function fetchQueryOrNull<Q extends FunctionReference<"query">>(
  q: Q,
  args: Q["_args"],
): Promise<FunctionReturnType<Q> | null> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return null;
  try {
    return await fetchQuery(q, args);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const guide = await fetchQueryOrNull(api.guides.bySlug, { slug });
  if (!guide) return {};

  const description = truncateForMeta(guide.description);
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/guides/${guide.slug}`;
  const localeAlternates = Object.fromEntries(
    routing.locales.map((l) => [
      l,
      absoluteUrl(`${l === routing.defaultLocale ? "" : `/${l}`}/guides/${guide.slug}`),
    ]),
  );

  const categoryName = guideCategoryLabel(guide.category as GuideCategoryKey);
  const stepSuffix =
    guide.journeyStep !== undefined ? ` — Step ${guide.journeyStep} of 19` : "";
  const titleSuffix = categoryName ? ` — ${categoryName}` : "";

  return {
    title: `${guide.title}${stepSuffix}${titleSuffix}`,
    description,
    alternates: {
      canonical: path || "/",
      languages: { ...localeAlternates, "x-default": absoluteUrl(`/guides/${guide.slug}`) },
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: guide.title,
      description,
      url: absoluteUrl(path),
      locale,
    },
    twitter: { card: "summary_large_image", title: guide.title, description },
  };
}

export default async function GuideSlugPage({ params }: Readonly<Props>) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  // Validate up-front so missing slugs return real 404s, not soft-404s.
  const initial = await fetchQueryOrNull(api.guides.bySlug, { slug });
  if (initial === null) notFound();

  const preloaded = await preloadQuery(api.guides.bySlug, { slug });

  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const pageUrl = `${SITE_URL}${localePath}/guides/${initial.slug}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": pageUrl,
    headline: initial.title,
    description: initial.description,
    inLanguage: locale,
    url: pageUrl,
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: pageUrl,
    ...(initial.lastSyncedAt
      ? { dateModified: new Date(initial.lastSyncedAt).toISOString() }
      : {}),
    ...(initial._creationTime
      ? { datePublished: new Date(initial._creationTime).toISOString() }
      : {}),
    ...(initial.sourceUrl ? { sameAs: initial.sourceUrl } : {}),
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "Guides",
          item: `${SITE_URL}${localePath}/guides`,
        },
        { "@type": "ListItem", position: 3, name: initial.title, item: pageUrl },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={<GuideDetailSkeleton />}>
        <GuideDetailClient preloaded={preloaded} />
      </Suspense>
    </>
  );
}
