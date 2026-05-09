"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { ResourceBody } from "@/components/resources/resource-body";
import { categoryLabel, type ResourceCategoryKey } from "@/lib/resources/categories";

type Props = {
  slug: string;
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

export function ResourceDetailClient({ slug }: Props) {
  const resource = useQuery(api.resources.bySlug, { slug });

  if (resource === undefined) {
    return <Text className="px-4 py-10 text-center text-muted-fg">Loading resource…</Text>;
  }
  if (resource === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Heading level={1} className="text-2xl">
          Resource not found
        </Heading>
        <Link href="/resources" className="mt-4 inline-block text-primary underline">
          Back to browse
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <Link href="/resources" className="text-muted-fg text-sm hover:text-fg">
          ← Browse all
        </Link>
        <Heading level={1} className="mt-4 text-3xl tracking-tight sm:text-4xl">
          {resource.title}
        </Heading>
        {resource.category ? (
          <Badge intent="primary" className="mt-3 text-xs">
            {categoryLabel(resource.category as ResourceCategoryKey)}
          </Badge>
        ) : null}
        <Text className="mt-4 text-lg text-muted-fg">{resource.description}</Text>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={resource.url}
            className={buttonStyles({ intent: "primary", size: "md" })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit official site ↗
          </a>
          <Link
            href={`/guide?q=${encodeURIComponent(`Explain how "${resource.title}" (${resource.slug}) fits my founder journey.`)}`}
            className={buttonStyles({ intent: "outline", size: "md" })}
          >
            Ask the guide about this resource
          </Link>
        </div>
      </div>
      {resource.body ? (
        <section aria-label="Background">
          <Heading level={2} className="mb-3 text-xl font-semibold tracking-tight">
            Background
          </Heading>
          <ResourceBody body={resource.body} />
        </section>
      ) : null}
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <ChipRow label="Tags" values={resource.tags} />
        <ChipRow label="Communities / audiences" values={resource.communities} />
        <ChipRow label="Industries" values={resource.industries} />
        <ChipRow label="Coverage" values={resource.locations} />
        <ChipRow label="Stage cues" values={resource.stageTags} />
        {resource.contactEmail ? (
          <Text className="mt-4 text-sm">
            Contact:{" "}
            <a href={`mailto:${resource.contactEmail}`} className="text-primary underline">
              {resource.contactEmail}
            </a>
          </Text>
        ) : null}
      </div>
    </div>
  );
}
