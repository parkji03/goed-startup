"use client";

import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useQuiz } from "@/components/quiz/quiz-provider";
import { ResourceCard } from "@/components/resources/resource-card";
import { ResourceRow } from "@/components/resources/resource-row";
import { ResourceSubmitForm } from "@/components/resources/resource-submit-form";
import { ResourcesFilterBar } from "@/components/resources/resources-filter-bar";
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
import { RESOURCE_CATEGORIES, type ResourceCategoryKey } from "@/lib/resources/categories";
import {
  isResourceFiltersActive,
  matchesResourceFilters,
  parseResourceFiltersFromParams,
} from "@/lib/resources/filters";

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
  const [submitOpen, setSubmitOpen] = useState(false);
  const { toggleSidebar } = useSidebar();
  const quiz = useQuiz();

  const searchParams = useSearchParams();
  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseResourceFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );
  const filtersActive = isResourceFiltersActive(filters);

  // When filters are active each category's `items` is narrowed to matches
  // and `total` reflects the filtered count — that way "Jump to" buttons,
  // section headers, and the visible list all agree.
  const filteredGrouped = useMemo(() => {
    if (!grouped) return undefined;
    if (!filtersActive) return grouped;
    const out: typeof grouped = {} as typeof grouped;
    for (const c of RESOURCE_CATEGORIES) {
      const group = grouped[c.key];
      if (!group) {
        out[c.key] = { items: [], total: 0 };
        continue;
      }
      const items = group.items.filter((r) => matchesResourceFilters(r, filters));
      out[c.key] = { items, total: items.length };
    }
    return out;
  }, [grouped, filters, filtersActive]);

  // Only show jump buttons for categories that have at least one resource —
  // otherwise the button scrolls to a section that isn't rendered.
  const visibleCategories = filteredGrouped
    ? RESOURCE_CATEGORIES.filter((c) => (filteredGrouped[c.key]?.total ?? 0) > 0)
    : RESOURCE_CATEGORIES;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10">
      <section className="space-y-6">
        <div className="max-w-3xl">
          <Heading level={1} className="mt-2 text-4xl tracking-tight sm:text-5xl">
            Utah founder resources
          </Heading>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-overlay">
            <CardHeader
              title="Not sure where to start?"
              description="Take the founder questionnaire to tune recommendations."
            />
            <CardFooter>
              <Button intent="primary" size="sm" onPress={quiz.open}>
                Start questionnaire
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader
              title="Ask the Utah AI startup guide"
              description="Open the AI chat for funding and program questions."
            />
            <CardFooter>
              <Button intent="primary" size="sm" onPress={toggleSidebar}>
                Ask AI guide
              </Button>
            </CardFooter>
          </Card>
          <Card className="bg-overlay">
            <CardHeader
              title="Add a resource"
              description="Have something to contribute? Submit a partner or program for review."
            />
            <CardFooter>
              <Button intent="primary" size="sm" onPress={() => setSubmitOpen(true)}>
                Submit
              </Button>
            </CardFooter>
          </Card>
        </div>

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
        <div className="flex items-center justify-between gap-3">
          <Heading level={2} className="text-lg">
            Jump to
          </Heading>
          <ResourcesFilterBar />
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleCategories.length === 0 ? (
            <Text className="text-muted-fg text-sm">No categories match the current filters.</Text>
          ) : (
            visibleCategories.map((c) => (
              <Button
                key={c.key}
                size="sm"
                intent="secondary"
                onPress={() => scrollToCategory(c.key)}
              >
                {c.label}
              </Button>
            ))
          )}
        </div>
      </section>

      <section className="min-w-0 flex-1 space-y-4">
        {filteredGrouped === undefined ? (
          <Text className="text-muted-fg">Loading resources…</Text>
        ) : visibleCategories.length === 0 && filtersActive ? (
          <Text className="text-muted-fg">No resources match the current filters.</Text>
        ) : (
          <>
            {/* Desktop: grouped collapsible rows. allowsMultipleExpanded keeps every
                section open by default and lets the user toggle them independently. */}
            <div className="hidden md:block">
              <DisclosureGroup allowsMultipleExpanded defaultExpandedKeys={ALL_CATEGORY_KEYS}>
                {RESOURCE_CATEGORIES.map((c) => {
                  const group = filteredGrouped[c.key];
                  const items = group?.items ?? [];
                  const total = group?.total ?? 0;
                  if (items.length === 0) return null;
                  return (
                    <Disclosure key={c.key} id={c.key}>
                      {({ isExpanded }) => (
                        <div id={sectionDomId(c.key)} className="scroll-mt-24">
                          <DisclosureTrigger triggerIndicator={false}>
                            <ChevronDownIcon
                              aria-hidden
                              className="size-4 shrink-0"
                              style={{
                                transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 200ms",
                              }}
                            />
                            <span className="font-medium">{c.label}</span>
                            <span className="ml-auto text-muted-fg text-sm tabular-nums">
                              {total}
                            </span>
                          </DisclosureTrigger>
                          <DisclosurePanel>
                            <div className="rounded-lg border border-border bg-overlay">
                              {items.map((r) => (
                                <ResourceRow key={String(r._id)} resource={r} />
                              ))}
                            </div>
                          </DisclosurePanel>
                        </div>
                      )}
                    </Disclosure>
                  );
                })}
              </DisclosureGroup>
            </div>

            {/* Mobile: cards under category headings */}
            <div className="md:hidden space-y-6">
              {RESOURCE_CATEGORIES.map((c) => {
                const group = filteredGrouped[c.key];
                const items = group?.items ?? [];
                const total = group?.total ?? 0;
                if (items.length === 0) return null;
                return (
                  <div key={c.key} id={sectionDomId(c.key)} className="space-y-3 scroll-mt-24">
                    <div className="flex items-baseline justify-between">
                      <Heading level={3} className="text-base">
                        {c.label}
                      </Heading>
                      <Text className="text-muted-fg text-sm tabular-nums">{total}</Text>
                    </div>
                    <div className="grid gap-4">
                      {items.map((r) => (
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
