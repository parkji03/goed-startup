"use client";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Link as UiLink } from "@/components/ui/link";
import { Text } from "@/components/ui/text";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ResourceCategoryKey } from "@/lib/resources/categories";

export type ResourceRowData = {
  _id: unknown;
  title: string;
  slug: string;
  description: string;
  url: string;
  category?: ResourceCategoryKey;
  tags: string[];
  stageTags: string[];
  communities: string[];
};

export function ResourceRow({ resource }: { resource: ResourceRowData }) {
  const stage = resource.stageTags[0];
  const community = resource.communities[0];
  const featuredTag = resource.tags[0];

  return (
    <div className="group grid grid-cols-[1fr_auto] items-start gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/40">
      <div className="min-w-0">
        <Link
          href={`/resources/${resource.slug}`}
          className="block text-base font-medium text-fg hover:underline"
        >
          {resource.title}
        </Link>
        <Text className="text-muted-fg mt-1 line-clamp-1 text-sm">{resource.description}</Text>
        {community || stage || featuredTag ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {community ? (
              <Badge intent="outline" className="text-xs">
                {community}
              </Badge>
            ) : null}
            {stage ? (
              <Badge intent="outline" className="text-xs">
                {stage}
              </Badge>
            ) : null}
            {featuredTag ? (
              <Badge intent="outline" className="text-xs">
                {featuredTag}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <Tooltip>
        <TooltipTrigger>
          <UiLink
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${resource.title} in a new tab`}
            className="text-muted-fg hover:text-fg p-1"
          >
            ↗
          </UiLink>
        </TooltipTrigger>
        <TooltipContent>Open official site</TooltipContent>
      </Tooltip>
    </div>
  );
}
