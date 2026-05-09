import type { Metadata } from "next";
import { Suspense } from "react";
import { preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { ResourcesBrowseClient } from "@/components/resources/resources-browse-client";
import { ResourcesBrowseSkeleton } from "@/components/resources/resources-browse-skeleton";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/resources`;
  const title = "Founder resources";
  const description =
    "Browse Utah accelerators, grants, capital, mentor networks, and operator resources curated for founders at every stage.";

  return {
    title,
    description,
    alternates: {
      canonical: path || "/resources",
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          absoluteUrl(`${l === routing.defaultLocale ? "" : `/${l}`}/resources`),
        ]),
      ),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}${path || "/resources"}`,
      locale,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ResourcesPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  const convexLocale: "en" | "es" = locale === "es" ? "es" : "en";
  // Preload up to 200/category — covers expected catalog growth without
  // bloating the SSR payload. Anything bigger needs pagination.
  const preloadedGrouped = await preloadQuery(api.resources.listGroupedByCategory, {
    limitPerCategory: 200,
    locale: convexLocale,
  });

  return (
    <Suspense fallback={<ResourcesBrowseSkeleton />}>
      <ResourcesBrowseClient preloadedGrouped={preloadedGrouped} />
    </Suspense>
  );
}
