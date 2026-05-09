import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GUIDE_CATEGORIES } from "@/lib/guides/categories";

/**
 * Suspense fallback for /guides — mirrors the real page (header + 3
 * category sections × 3 cards) so layout doesn't shift on hydration.
 */
export function GuidesBrowseSkeleton() {
  const visible = GUIDE_CATEGORIES.filter((c) => c.key !== "journey-step").slice(0, 3);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 space-y-3">
        <Skeleton className="h-9 w-40 sm:h-10" soft />
        <Skeleton className="h-5 w-full max-w-2xl" soft />
        <Skeleton className="h-5 w-3/4 max-w-2xl" soft />
        <Skeleton className="h-9 w-64" soft />
      </header>
      <div className="space-y-10">
        {visible.map((c) => (
          <section key={c.key}>
            <div className="mb-3 space-y-2">
              <Skeleton className="h-6 w-48" soft />
              <Skeleton className="h-4 w-72" soft />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="bg-overlay">
                  <CardHeader className="pb-3 space-y-2">
                    <Skeleton className="h-5 w-2/3" soft />
                    <Skeleton className="h-4 w-full" soft />
                    <Skeleton className="h-4 w-5/6" soft />
                  </CardHeader>
                  <CardFooter>
                    <Skeleton className="h-8 w-24" soft />
                  </CardFooter>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
