"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

const SECTIONS: ReadonlyArray<{ label: string; tagline: string; range: [number, number] }> = [
  { label: "Thinking of starting", tagline: "Build the idea and the muscles", range: [1, 2] },
  { label: "Start the business", tagline: "Validate, build, register, fund, operate", range: [3, 11] },
  { label: "Grow the business", tagline: "Community, capital, talent, expansion", range: [12, 18] },
  { label: "Sell or exit", tagline: "Wind down or hand off", range: [19, 19] },
];

type Props = {
  preloadedSteps: Preloaded<typeof api.guides.listJourneySteps>;
};

export function JourneyViewClient({ preloadedSteps }: Props) {
  const steps = usePreloadedQuery(preloadedSteps);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8">
        <Link href="/guides" className="text-muted-fg text-sm hover:text-fg">
          ← Back to all guides
        </Link>
        <Heading level={1} className="mt-4 text-3xl tracking-tight sm:text-4xl">
          The 19-step Founder Journey
        </Heading>
        <Text className="mt-3 max-w-2xl text-muted-fg">
          A canonical path from idea to exit, mapped to the steps Utah’s state programs are
          organized around. Each step links to a deeper read.
        </Text>
      </header>

      <div className="space-y-8">
        {SECTIONS.map((section) => {
          const inRange = steps.filter(
            (s) => s.journeyStep >= section.range[0] && s.journeyStep <= section.range[1],
          );
          if (inRange.length === 0) return null;
          return (
            <section key={section.label}>
              <div className="mb-3">
                <Heading level={2} className="text-xl font-semibold tracking-tight">
                  {section.label}
                </Heading>
                <Text className="text-sm text-muted-fg">{section.tagline}</Text>
              </div>
              <ol className="space-y-2">
                {inRange.map((s) => (
                  <li key={s._id as string}>
                    <Link
                      href={`/guides/${s.slug}`}
                      className="flex items-start gap-3 rounded-lg border border-border bg-overlay p-4 transition-colors hover:border-primary/50 hover:bg-muted/30"
                    >
                      <Badge intent="primary" className="shrink-0 text-xs">
                        Step {s.journeyStep}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <Text className="font-semibold text-fg">{s.title.replace(/^Step \d+:\s*/, "")}</Text>
                        <Text className="mt-1 line-clamp-2 text-sm text-muted-fg">
                          {s.description}
                        </Text>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
