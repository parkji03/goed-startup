import type { Metadata } from "next";
import { Suspense } from "react";
import { preloadQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { GuidesBrowseClient } from "@/components/guides/guides-browse-client";
import { GuidesBrowseSkeleton } from "@/components/guides/guides-browse-skeleton";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/guides`;
  const title = "Guides for Utah founders";
  const description =
    "Plain-English guides for Utah entrepreneurs — validating an idea, registering a business, raising capital, hiring, scaling, and exiting. Includes the 19-step Founder Journey.";

  return {
    title,
    description,
    alternates: {
      canonical: path || "/guides",
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          absoluteUrl(`${l === routing.defaultLocale ? "" : `/${l}`}/guides`),
        ]),
      ),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}${path || "/guides"}`,
      locale,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function GuidesPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Preload up to 200/category — covers expected catalog growth without
  // bloating the SSR payload. Anything bigger needs pagination.
  const preloadedGrouped = await preloadQuery(api.guides.listGroupedByCategory, {
    limitPerCategory: 200,
  });

  return (
    <Suspense fallback={<GuidesBrowseSkeleton />}>
      <GuidesBrowseClient preloadedGrouped={preloadedGrouped} />
    </Suspense>
  );
}
