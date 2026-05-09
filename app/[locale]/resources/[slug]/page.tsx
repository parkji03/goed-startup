import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { fetchQuery, preloadQuery } from "convex/nextjs";
import type { FunctionReference, FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";

/**
 * Wrapper around `fetchQuery` that swallows transport errors during render
 * (e.g. NEXT_PUBLIC_CONVEX_URL missing in CI) and returns null instead.
 * Lets metadata generation degrade gracefully without 500'ing the route.
 */
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
import { ResourceDetailClient } from "@/components/resources/resource-detail-client";
import { ResourceDetailSkeleton } from "@/components/resources/resource-detail-skeleton";
import { categoryLabel, type ResourceCategoryKey } from "@/lib/resources/categories";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL, truncateForMeta } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const convexLocale: "en" | "es" = locale === "es" ? "es" : "en";

  const resource = await fetchQueryOrNull(api.resources.bySlug, { slug, locale: convexLocale });
  if (!resource) return {};

  const description = truncateForMeta(resource.description);
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/resources/${resource.slug}`;
  const localeAlternates = Object.fromEntries(
    routing.locales.map((l) => [
      l,
      absoluteUrl(`${l === routing.defaultLocale ? "" : `/${l}`}/resources/${resource.slug}`),
    ]),
  );

  const categoryName = resource.category
    ? categoryLabel(resource.category as ResourceCategoryKey)
    : undefined;
  const titleSuffix = categoryName ? ` — ${categoryName}` : "";

  return {
    title: `${resource.title}${titleSuffix}`,
    description,
    alternates: {
      canonical: path || "/",
      languages: { ...localeAlternates, "x-default": absoluteUrl(`/resources/${resource.slug}`) },
    },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      title: resource.title,
      description,
      url: absoluteUrl(path),
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title: resource.title,
      description,
    },
  };
}

export default async function ResourceSlugPage({ params }: Readonly<Props>) {
  const { locale, slug } = await params;
  const convexLocale: "en" | "es" = locale === "es" ? "es" : "en";

  // Validate the resource exists up-front so we can 404 the route — without
  // this the client would render the "not found" branch but Next.js would
  // still return 200, which Google treats as a soft-404.
  const initial = await fetchQueryOrNull(api.resources.bySlug, { slug, locale: convexLocale });
  if (initial === null) notFound();

  const preloaded = await preloadQuery(api.resources.bySlug, { slug, locale: convexLocale });

  // JSON-LD describing the resource as a curated link to an external
  // organization/program. Helps search engines surface it as a knowledge
  // entity. Inline so it ships in the document, not a separate request.
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const pageUrl = `${SITE_URL}${localePath}/resources/${initial.slug}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": pageUrl,
    url: pageUrl,
    name: initial.title,
    description: initial.description,
    inLanguage: locale,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL,
    },
    mainEntity: {
      "@type": "Organization",
      name: initial.title,
      url: initial.url,
      description: initial.description,
      ...(initial.contactEmail
        ? { email: initial.contactEmail }
        : {}),
      ...(initial.locations.length
        ? {
            areaServed: initial.locations.map((l) => ({
              "@type": "Place",
              name: l,
            })),
          }
        : {}),
    },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: SITE_NAME,
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Resources",
          item: `${SITE_URL}${localePath}/resources`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: initial.title,
          item: pageUrl,
        },
      ],
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify is XSS-safe for plain objects; values originate
        // from our DB only and contain no script/HTML payloads.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={<ResourceDetailSkeleton />}>
        <ResourceDetailClient preloaded={preloaded} />
      </Suspense>
    </>
  );
}
