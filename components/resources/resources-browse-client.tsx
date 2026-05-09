"use client";

import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { FounderQuizClient } from "@/components/quiz/founder-quiz-client";
import { ResourceCard } from "@/components/resources/resource-card";
import { ResourceRow } from "@/components/resources/resource-row";
import { ResourceSubmitForm } from "@/components/resources/resource-submit-form";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  DisclosureTrigger,
} from "@/components/ui/disclosure-group";
import { Heading } from "@/components/ui/heading";
import { ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import { useSidebar } from "@/components/ui/sidebar";
import {
  RESOURCE_CATEGORIES,
  type ResourceCategoryKey,
} from "@/lib/resources/categories";

const ALL_CATEGORY_KEYS = RESOURCE_CATEGORIES.map((c) => c.key);

function sectionDomId(key: ResourceCategoryKey): string {
  return `resource-section-${key}`;
}

function scrollToCategory(key: ResourceCategoryKey) {
  const el = typeof document !== "undefined" ? document.getElementById(sectionDomId(key)) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ResourcesBrowseClient() {
  const grouped = useQuery(api.resources.listGroupedByCategory, { limitPerCategory: 50 });
  const [quizOpen, setQuizOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const { toggleSidebar } = useSidebar();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <section className="space-y-6">
        <div className="max-w-3xl">
          <Text className="text-muted-fg">Resource Library</Text>
          <Heading level={1} className="mt-2 text-4xl tracking-tight sm:text-5xl">
            Utah founder resources
          </Heading>
          <Text className="mt-4 max-w-2xl text-lg text-muted-fg">
            Curated partners and programs sourced from Startup Utah Builder Day. Filter by
            category, search from the top bar, or ask the AI guide for a recommended path.
          </Text>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-overlay">
            <CardHeader
              title="Get matched"
              description="Take the founder quiz to tune recommendations."
            />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setQuizOpen(true)}>
                Start quiz
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader
              title="Ask the guide"
              description="Open the AI chat for funding and program questions."
            />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={toggleSidebar}>
                Ask AI guide
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader
              title="Add a resource"
              description="Submit a partner or program for review."
            />
            <CardFooter>
              <Button intent="outline" size="sm" onPress={() => setSubmitOpen(true)}>
                Submit
              </Button>
            </CardFooter>
          </Card>
        </div>

        <ModalContent
          isOpen={quizOpen}
          onOpenChange={setQuizOpen}
          size="2xl"
          aria-label="Founder quiz"
        >
          <ModalHeader>
            <ModalTitle>Founder quiz</ModalTitle>
          </ModalHeader>
          <ModalBody className="pb-6">
            <FounderQuizClient onComplete={() => setQuizOpen(false)} />
          </ModalBody>
        </ModalContent>

        <ModalContent
          isOpen={submitOpen}
          onOpenChange={setSubmitOpen}
          size="xl"
          aria-label="Submit a resource"
        >
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
          Jump to
        </Heading>
        <div className="flex flex-wrap gap-2">
          {RESOURCE_CATEGORIES.map((c) => (
            <Button
              key={c.key}
              size="sm"
              intent="secondary"
              onPress={() => scrollToCategory(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="min-w-0 flex-1 space-y-4">
        {grouped === undefined ? (
          <Text className="text-muted-fg">Loading resources…</Text>
        ) : (
          <>
            {/* Desktop: grouped collapsible rows. allowsMultipleExpanded keeps every
                section open by default and lets the user toggle them independently. */}
            <div className="hidden md:block">
              <DisclosureGroup
                allowsMultipleExpanded
                defaultExpandedKeys={ALL_CATEGORY_KEYS}
              >
                {RESOURCE_CATEGORIES.map((c) => {
                  const list = grouped[c.key] ?? [];
                  if (list.length === 0) return null;
                  return (
                    <Disclosure key={c.key} id={c.key}>
                      <div id={sectionDomId(c.key)} className="scroll-mt-24">
                        <DisclosureTrigger triggerIndicator={false}>
                          <ChevronDownIcon
                            aria-hidden
                            className="size-4 shrink-0 -rotate-90 transition-transform duration-200 group-expanded/disclosure-item:rotate-0"
                          />
                          <span className="font-medium">{c.label}</span>
                          <span className="ml-auto text-muted-fg text-sm tabular-nums">
                            {list.length}
                          </span>
                        </DisclosureTrigger>
                        <DisclosurePanel>
                          <div className="rounded-lg border border-border bg-overlay">
                            {list.map((r) => (
                              <ResourceRow key={String(r._id)} resource={r} />
                            ))}
                          </div>
                        </DisclosurePanel>
                      </div>
                    </Disclosure>
                  );
                })}
              </DisclosureGroup>
            </div>

            {/* Mobile: cards under category headings */}
            <div className="md:hidden space-y-6">
              {RESOURCE_CATEGORIES.map((c) => {
                const list = grouped[c.key] ?? [];
                if (list.length === 0) return null;
                return (
                  <div
                    key={c.key}
                    id={sectionDomId(c.key)}
                    className="space-y-3 scroll-mt-24"
                  >
                    <div className="flex items-baseline justify-between">
                      <Heading level={3} className="text-base">
                        {c.label}
                      </Heading>
                      <Text className="text-muted-fg text-sm tabular-nums">{list.length}</Text>
                    </div>
                    <div className="grid gap-4">
                      {list.map((r) => (
                        <ResourceCard key={String(r._id)} resource={r} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
