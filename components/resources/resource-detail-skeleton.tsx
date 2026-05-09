import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the layout of the resource detail page so the page doesn't
 * jump when content streams in.
 */
export function ResourceDetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" soft />
        <Skeleton className="h-9 w-3/4 sm:h-10" soft />
        <Skeleton className="h-5 w-24 rounded-full" soft />
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" soft />
          <Skeleton className="h-5 w-11/12" soft />
          <Skeleton className="h-5 w-3/4" soft />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-40" soft />
          <Skeleton className="h-9 w-56" soft />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-4 first:mt-0 space-y-2">
            <Skeleton className="h-3 w-24" soft />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-16 rounded-full" soft />
              <Skeleton className="h-5 w-20 rounded-full" soft />
              <Skeleton className="h-5 w-14 rounded-full" soft />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
