import { Suspense } from "react";
import { GuideClient } from "@/components/guide/guide-client";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function GuidePage({ searchParams }: Readonly<PageProps>) {
  const sp = (await searchParams) ?? {};
  return (
    <Suspense fallback={<p className="px-4 py-12 text-center text-muted-fg">Loading guide…</p>}>
      <GuideClient initialQuery={sp.q ?? ""} />
    </Suspense>
  );
}
