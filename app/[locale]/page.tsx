import { Suspense } from "react";
import { preloadQuery } from "convex/nextjs";
import { setRequestLocale } from "next-intl/server";
import { api } from "@/convex/_generated/api";
import { ResourcesBrowseClient } from "@/components/resources/resources-browse-client";
import { ResourcesBrowseSkeleton } from "@/components/resources/resources-browse-skeleton";

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const preloadedGrouped = await preloadQuery(api.resources.listGroupedByCategory, {
    limitPerCategory: 50,
  });

  return (
    <Suspense fallback={<ResourcesBrowseSkeleton />}>
      <ResourcesBrowseClient preloadedGrouped={preloadedGrouped} />
    </Suspense>
  );
}
