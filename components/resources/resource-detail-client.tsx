"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import type { ResourceCategoryKey } from "@/lib/resources/categories";

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
  const t = useTranslations("Resources.detail");
  const tChips = useTranslations("Resources.detail.chips");
  const tCat = useTranslations("Taxonomy.resourceCategories");
  const rawLocale = useLocale();
  const locale: "en" | "es" = rawLocale === "es" ? "es" : "en";
  const resource = useQuery(api.resources.bySlug, { slug, locale });

  if (resource === undefined) {
    return <Text className="px-4 py-10 text-center text-muted-fg">{t("loading")}</Text>;
  }
  if (resource === null) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <Heading level={1} className="text-2xl">
          {t("notFound")}
        </Heading>
        <Link href="/resources" className="mt-4 inline-block text-primary underline">
          {t("backToBrowse")}
        </Link>
      </div>
    );
  }

  const category = resource.category as ResourceCategoryKey | undefined;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <div>
        <Link href="/resources" className="text-muted-fg text-sm hover:text-fg">
          {t("browseAll")}
        </Link>
        <Heading level={1} className="mt-4 text-3xl tracking-tight sm:text-4xl">
          {resource.title}
        </Heading>
        {category ? (
          <Badge intent="primary" className="mt-3 text-xs">
            {tCat(`${category}.label`)}
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
            {t("visitSite")}
          </a>
          <Link
            href={`/guide?q=${encodeURIComponent(t("askGuidePrompt", { title: resource.title, slug: resource.slug }))}`}
            className={buttonStyles({ intent: "outline", size: "md" })}
          >
            {t("askGuide")}
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <ChipRow label={tChips("tags")} values={resource.tags} />
        <ChipRow label={tChips("communities")} values={resource.communities} />
        <ChipRow label={tChips("industries")} values={resource.industries} />
        <ChipRow label={tChips("coverage")} values={resource.locations} />
        <ChipRow label={tChips("stage")} values={resource.stageTags} />
        {resource.contactEmail ? (
          <Text className="mt-4 text-sm">
            {tChips("contact")}{" "}
            <a href={`mailto:${resource.contactEmail}`} className="text-primary underline">
              {resource.contactEmail}
            </a>
          </Text>
        ) : null}
      </div>
    </div>
  );
}
