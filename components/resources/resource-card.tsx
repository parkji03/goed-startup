"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link as UiLink } from "@/components/ui/link";
import type { ResourceRowData } from "./resource-row";

export function ResourceCard({ resource }: { resource: ResourceRowData }) {
  const t = useTranslations("Resources.card");
  return (
    <Card className="bg-overlay">
      <CardHeader className="pb-3">
        <CardTitle>{resource.title}</CardTitle>
        <CardDescription className="line-clamp-4 text-fg/80">
          {resource.description}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-wrap gap-2">
        <Link
          href={`/resources/${resource.slug}`}
          className={buttonStyles({ intent: "outline", size: "sm" })}
        >
          {t("viewDetails")}
        </Link>
        <UiLink
          href={resource.url}
          className={buttonStyles({ intent: "outline", size: "sm" })}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("officialSite")}
        </UiLink>
      </CardFooter>
    </Card>
  );
}
