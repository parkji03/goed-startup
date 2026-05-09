import type { Metadata } from "next";
import { Suspense } from "react";
import { preloadQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { JourneyViewClient } from "@/components/guides/journey-view-client";
import { JourneySkeleton } from "@/components/guides/journey-skeleton";
import { routing } from "@/i18n/routing";
import { absoluteUrl, SITE_NAME, SITE_URL } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const path = `${localePath}/guides/journey`;
  const title = "The 19-step Founder Journey";
  const description =
    "A canonical path from idea to exit, mapped to the steps Utah's state programs are organized around. Each step links to a deeper read.";

  return {
    title,
    description,
    alternates: {
      canonical: path || "/guides/journey",
      languages: Object.fromEntries(
        routing.locales.map((l) => [
          l,
          absoluteUrl(
            `${l === routing.defaultLocale ? "" : `/${l}`}/guides/journey`,
          ),
        ]),
      ),
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}${path}`,
      locale,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function JourneyPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const preloadedSteps = await preloadQuery(api.guides.listJourneySteps, {});

  return (
    <Suspense fallback={<JourneySkeleton />}>
      <JourneyViewClient preloadedSteps={preloadedSteps} />
    </Suspense>
  );
}
