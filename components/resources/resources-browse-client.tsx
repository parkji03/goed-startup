"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
export function ResourcesBrowseClient() {
  const topics = useQuery(api.resources.facetValues, { facetType: "topic", limit: 40 });
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const filtered = useQuery(
    api.resources.listByFacet,
    topicFilter ? { facetType: "topic" as const, value: topicFilter, limit: 40 } : "skip",
  );

  const all = usePaginatedQuery(api.resources.listPublishedPage, {}, { initialNumItems: 16 });

  const cards = topicFilter ? filtered : all.results;

  const loadingCards = topicFilter ? filtered === undefined : all.status === "LoadingFirstPage";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 lg:flex-row">
      <aside className="lg:w-60 lg:shrink-0">
        <Heading level={2} className="mb-3 text-lg">
          Topics
        </Heading>
        <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
          <Button
            size="sm"
            intent={topicFilter === null ? "primary" : "secondary"}
            onPress={() => setTopicFilter(null)}
          >
            All resources
          </Button>
          {topics?.map((t) => (
            <Button
              key={t}
              size="sm"
              intent={topicFilter === t ? "primary" : "secondary"}
              className="justify-start"
              onPress={() => setTopicFilter(t)}
            >
              {t}
            </Button>
          )) ?? <Text className="text-muted-fg text-sm">Loading topics…</Text>}
        </div>
      </aside>
      <section className="min-w-0 flex-1 space-y-4">
        <div>
          <Heading level={1} className="text-3xl tracking-tight sm:text-4xl">
            Utah founder resources
          </Heading>
          <Text className="mt-2 max-w-2xl text-muted-fg">
            Curated partners and programs sourced from Startup Utah Builder Day — searchable,
            filtered, and personalizable via the quiz and AI guide.
          </Text>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {loadingCards ? (
            <Text className="text-muted-fg">Loading cards…</Text>
          ) : (
            cards?.map((r) => (
              <Card key={String(r._id)}>
                <CardHeader className="pb-3">
                  <CardTitle>{r.title}</CardTitle>
                  <CardDescription className="line-clamp-4">{r.description}</CardDescription>
                </CardHeader>
                <CardFooter className="flex flex-wrap gap-2">
                  <Link
                    href={`/resources/${r.slug}`}
                    className={buttonStyles({ intent: "outline", size: "sm" })}
                  >
                    View details
                  </Link>
                  <a
                    href={r.url}
                    className={buttonStyles({ intent: "outline", size: "sm" })}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Official site ↗
                  </a>
                </CardFooter>
              </Card>
            ))
          )}
        </div>
        {!topicFilter && all.status === "CanLoadMore" ? (
          <Button intent="outline" size="sm" className="w-full sm:w-auto" onPress={() => all.loadMore(16)}>
            Load more
          </Button>
        ) : null}
      </section>
    </div>
  );
}
