"use client";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  guide: {
    title: string;
    slug: string;
    description: string;
    journeyStep?: number;
  };
};

export function GuideCard({ guide }: Props) {
  return (
    <Card className="bg-overlay">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          {guide.journeyStep !== undefined ? (
            <Badge intent="primary" className="shrink-0 text-xs">
              Step {guide.journeyStep}
            </Badge>
          ) : null}
          {guide.title}
        </CardTitle>
        <CardDescription className="line-clamp-4 text-fg/80">
          {guide.description}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          href={`/guides/${guide.slug}`}
          className={buttonStyles({ intent: "outline", size: "sm" })}
        >
          Read guide
        </Link>
      </CardFooter>
    </Card>
  );
}
