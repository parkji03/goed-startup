import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { MapPageClient } from "./map-page";

// The map is interactive WebGL with live Convex subscriptions and
// `useSearchParams` — it can't be prerendered. Opt out so the build
// succeeds and the route is rendered on demand.
export const dynamic = "force-dynamic";

export default async function MapPage({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense fallback={null}>
      <MapPageClient />
    </Suspense>
  );
}
