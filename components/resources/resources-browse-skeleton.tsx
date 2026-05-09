import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RESOURCE_CATEGORIES } from "@/lib/resources/categories";

/**
 * Suspense fallback for /resources. Mirrors the shape of the real page
 * (hero + 3 action cards + jump bar + grouped category lists) so the
 * layout doesn't shift when streamed content replaces the skeleton.
 */
export function ResourcesBrowseSkeleton() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <section className="space-y-6">
        <div className="max-w-3xl space-y-3">
          <Skeleton className="h-10 w-3/4 sm:h-12" soft />
          <Skeleton className="h-5 w-1/2" soft />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="bg-overlay">
              <CardHeader>
                <Skeleton className="h-5 w-2/3" soft />
                <Skeleton className="mt-2 h-4 w-full" soft />
              </CardHeader>
              <CardFooter>
                <Skeleton className="h-9 w-32" soft />
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-5 w-20" soft />
          <Skeleton className="h-9 w-40" soft />
        </div>
        <div className="flex flex-wrap gap-2">
          {RESOURCE_CATEGORIES.map((c) => (
            <Skeleton key={c.key} className="h-9 w-28" soft />
          ))}
        </div>
      </section>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="hidden md:block">
          {RESOURCE_CATEGORIES.slice(0, 4).map((c) => (
            <div key={c.key} className="border-b border-border py-3 last:border-b-0">
              <div className="flex items-center gap-3 px-2">
                <Skeleton className="size-4" soft />
                <Skeleton className="h-4 w-40" soft />
                <Skeleton className="ml-auto h-4 w-6" soft />
              </div>
              <div className="mt-3 rounded-lg border border-border bg-overlay">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-2/5" soft />
                      <Skeleton className="h-4 w-full max-w-md" soft />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-20 rounded-full" soft />
                        <Skeleton className="h-5 w-16 rounded-full" soft />
                      </div>
                    </div>
                    <Skeleton className="size-6" soft />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="md:hidden space-y-6">
          {RESOURCE_CATEGORIES.slice(0, 3).map((c) => (
            <div key={c.key} className="space-y-3">
              <div className="flex items-baseline justify-between">
                <Skeleton className="h-4 w-32" soft />
                <Skeleton className="h-4 w-6" soft />
              </div>
              <div className="grid gap-4">
                {[0, 1].map((i) => (
                  <Card key={i} className="bg-overlay">
                    <CardHeader className="space-y-2 pb-3">
                      <Skeleton className="h-5 w-2/3" soft />
                      <Skeleton className="h-4 w-full" soft />
                      <Skeleton className="h-4 w-4/5" soft />
                    </CardHeader>
                    <CardFooter className="flex flex-wrap gap-2">
                      <Skeleton className="h-8 w-24" soft />
                      <Skeleton className="h-8 w-24" soft />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
