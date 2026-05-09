"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { FounderQuizClient } from "@/components/quiz/founder-quiz-client";
import { ResourceSubmitForm } from "@/components/resources/resource-submit-form";
import { Button, buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Link as UiLink } from "@/components/ui/link";
import { ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import { useSidebar } from "@/components/ui/sidebar";

export function ResourcesBrowseClient() {
  const topics = useQuery(api.resources.facetValues, { facetType: "topic", limit: 40 });
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const { toggleSidebar } = useSidebar();

  const filtered = useQuery(
    api.resources.listByFacet,
    topicFilter ? { facetType: "topic" as const, value: topicFilter, limit: 40 } : "skip",
  );

  const all = usePaginatedQuery(api.resources.listPublishedPage, {}, { initialNumItems: 16 });

  const cards = topicFilter ? filtered : all.results;

  const loadingCards = topicFilter ? filtered === undefined : all.status === "LoadingFirstPage";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <section className="space-y-6">
        <div className="max-w-3xl">
          <Text className="text-muted-fg">Resource Library</Text>
          <Heading level={1} className="mt-2 text-4xl tracking-tight sm:text-5xl">
            Utah founder resources
          </Heading>
          <Text className="mt-4 max-w-2xl text-lg text-muted-fg">
            Curated partners and programs sourced from Startup Utah Builder Day. Search from
            the top bar, filter by topic, or ask the AI guide for a recommended path.
          </Text>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-overlay">
            <CardHeader title="Get matched" description="Take the founder quiz to tune recommendations." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setQuizOpen(true)}>
                Start quiz
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader title="Ask the guide" description="Open the AI chat for funding and program questions." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={toggleSidebar}>
                Ask AI guide
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader title="Add a resource" description="Submit a partner or program for review." />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setSubmitOpen(true)}>
                Submit
              </Button>
            </CardFooter>
          </Card>
        </div>

        <ModalContent isOpen={quizOpen} onOpenChange={setQuizOpen} size="2xl" aria-label="Founder quiz">
          <ModalHeader>
            <ModalTitle>Founder quiz</ModalTitle>
          </ModalHeader>
          <ModalBody className="pb-6">
            <FounderQuizClient onComplete={() => setQuizOpen(false)} />
          </ModalBody>
        </ModalContent>

        <ModalContent isOpen={submitOpen} onOpenChange={setSubmitOpen} size="xl" aria-label="Submit a resource">
          <ModalHeader>
            <ModalTitle>Submit a resource</ModalTitle>
          </ModalHeader>
          <ModalBody className="pb-6">
            <ResourceSubmitForm />
          </ModalBody>
        </ModalContent>
      </section>

      <section className="space-y-3">
        <Heading level={2} className="text-lg">
          Topics
        </Heading>
        <div className="flex flex-wrap gap-2">
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
              onPress={() => setTopicFilter(t)}
            >
              {t}
            </Button>
          )) ?? <Text className="text-muted-fg text-sm">Loading topics...</Text>}
        </div>
      </section>

      <section className="min-w-0 flex-1 space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loadingCards ? (
            <Text className="text-muted-fg">Loading cards...</Text>
          ) : (
            cards?.map((r) => (
              <Card key={String(r._id)} className="bg-overlay">
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
                  <UiLink
                    href={r.url}
                    className={buttonStyles({ intent: "outline", size: "sm" })}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Official site
                  </UiLink>
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
