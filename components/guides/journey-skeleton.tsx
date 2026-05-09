import { Skeleton } from "@/components/ui/skeleton";

export function JourneySkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 space-y-3">
        <Skeleton className="h-4 w-32" soft />
        <Skeleton className="h-9 w-3/4 sm:h-10" soft />
        <Skeleton className="h-5 w-full" soft />
        <Skeleton className="h-5 w-2/3" soft />
      </header>
      <div className="space-y-8">
        {[
          { steps: 2 },
          { steps: 4 },
          { steps: 4 },
          { steps: 1 },
        ].map((section, idx) => (
          <section key={idx}>
            <div className="mb-3 space-y-2">
              <Skeleton className="h-6 w-56" soft />
              <Skeleton className="h-4 w-72" soft />
            </div>
            <ol className="space-y-2">
              {Array.from({ length: section.steps }).map((_, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-lg border border-border bg-overlay p-4"
                >
                  <Skeleton className="h-5 w-16 rounded-full shrink-0" soft />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" soft />
                    <Skeleton className="h-4 w-full" soft />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
