"use client";

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
          View details
        </Link>
        <UiLink
          href={resource.url}
          className={buttonStyles({ intent: "outline", size: "sm" })}
          rel="noopener noreferrer"
          target="_blank"
        >
          Official site
        </UiLink>
      </CardFooter>
    </Card>
  );
}
