"use client";

import { type Preloaded, usePreloadedQuery } from "convex/react";
import type { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { ResourceBody } from "@/components/resources/resource-body";
import { guideCategoryLabel, type GuideCategoryKey } from "@/lib/guides/categories";

type Props = {
  preloaded: Preloaded<typeof api.guides.bySlug>;
};

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="mt-4">
      <Text className="text-muted-fg text-xs font-semibold uppercase tracking-wide">{label}</Text>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((v) => (
          <Badge key={v} intent="outline" isCircle={false} className="text-xs">
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

export function GuideDetailClient({ preloaded }: Props) {
  const guide = usePreloadedQuery(preloaded);

  if (guide === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Heading level={1} className="text-2xl">
          Guide not found
        </Heading>
        <Link href="/guides" className="mt-4 inline-block text-primary underline">
          Browse all guides
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <Link href="/guides" className="text-muted-fg text-sm hover:text-fg">
          ← Browse all guides
        </Link>
        <Heading level={1} className="mt-4 text-3xl tracking-tight sm:text-4xl">
          {guide.title}
        </Heading>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge intent="primary" className="text-xs">
            {guideCategoryLabel(guide.category as GuideCategoryKey)}
          </Badge>
          {guide.journeyStep !== undefined ? (
            <Badge intent="outline" className="text-xs">
              Step {guide.journeyStep} of 19
            </Badge>
          ) : null}
        </div>
        <Text className="mt-4 text-lg text-muted-fg">{guide.description}</Text>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={guide.sourceUrl}
            className={buttonStyles({ intent: "outline", size: "md" })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read on startup.utah.gov ↗
          </a>
          <Link
            href={`/guide?q=${encodeURIComponent(`Help me apply "${guide.title}" to my situation.`)}`}
            className={buttonStyles({ intent: "outline", size: "md" })}
          >
            Ask the guide about this
          </Link>
        </div>
      </div>

      <section aria-label="Guide body">
        <ResourceBody body={guide.body} />
      </section>

      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <ChipRow label="Tags" values={guide.tags} />
        <ChipRow label="Stage cues" values={guide.stageTags} />
      </div>
    </div>
  );
}
