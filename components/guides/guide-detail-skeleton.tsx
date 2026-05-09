import { Skeleton } from "@/components/ui/skeleton";

export function GuideDetailSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" soft />
        <Skeleton className="h-9 w-3/4 sm:h-10" soft />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24 rounded-full" soft />
          <Skeleton className="h-5 w-28 rounded-full" soft />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" soft />
          <Skeleton className="h-5 w-11/12" soft />
        </div>
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-48" soft />
          <Skeleton className="h-9 w-44" soft />
        </div>
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-full" soft />
        ))}
        <Skeleton className="h-4 w-2/3" soft />
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        {[0, 1].map((i) => (
          <div key={i} className="mt-4 first:mt-0 space-y-2">
            <Skeleton className="h-3 w-24" soft />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-5 w-16 rounded-full" soft />
              <Skeleton className="h-5 w-20 rounded-full" soft />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
