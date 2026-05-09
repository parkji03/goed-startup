"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { GuideCard } from "@/components/guides/guide-card";
import { buttonStyles } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Link } from "@/i18n/navigation";
import { GUIDE_CATEGORIES } from "@/lib/guides/categories";

type Props = {
  preloadedGrouped: Preloaded<typeof api.guides.listGroupedByCategory>;
};

export function GuidesBrowseClient({ preloadedGrouped }: Props) {
  const grouped = usePreloadedQuery(preloadedGrouped);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <Heading level={1} className="text-3xl tracking-tight sm:text-4xl">
          Guides
        </Heading>
        <Text className="mt-3 max-w-2xl text-muted-fg">
          Educational reads and the 19-step founder journey — written for Utah entrepreneurs at
          every stage. Different from <Link href="/resources" className="underline">Resources</Link>:
          guides teach you the how-to; resources are programs you can apply to or use.
        </Text>
        <div className="mt-5">
          <Link
            href="/guides/journey"
            className={buttonStyles({ intent: "primary", size: "md" })}
          >
            Open the 19-step Founder Journey →
          </Link>
        </div>
      </header>

      <div className="space-y-10">
        {GUIDE_CATEGORIES
          .filter((c) => c.key !== "journey-step")
          .map((cat) => {
            const group = grouped[cat.key];
            if (!group || group.items.length === 0) return null;
            return (
              <section key={cat.key} aria-labelledby={`guides-cat-${cat.key}`}>
                <div className="mb-3">
                  <Heading
                    id={`guides-cat-${cat.key}`}
                    level={2}
                    className="text-xl font-semibold tracking-tight"
                  >
                    {cat.label}
                  </Heading>
                  <Text className="text-sm text-muted-fg">{cat.tagline}</Text>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((g) => (
                    <GuideCard key={g._id as string} guide={g} />
                  ))}
                </div>
                {group.total > group.items.length ? (
                  <Text className="mt-3 text-xs text-muted-fg">
                    Showing {group.items.length} of {group.total} guides in this
                    section.
                  </Text>
                ) : null}
              </section>
            );
          })}
      </div>
    </div>
  );
}
