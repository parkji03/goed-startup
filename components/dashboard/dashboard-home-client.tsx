"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text, TextLink } from "@/components/ui/text";
import { Link } from "@/i18n/navigation";

export function DashboardHomeClient() {
  const t = useTranslations("Dashboard");
  const claims = useQuery(api.companyDashboard.myClaimedCompanies);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Heading level={1} className="text-3xl tracking-tight">
          {t("heading")}
        </Heading>
        <Text className="text-muted-fg">{t("blurb")}</Text>
      </div>

      {claims === undefined ? (
        <Text className="text-muted-fg">{t("loading")}</Text>
      ) : claims.length === 0 ? (
        <Card className="bg-muted/30">
          <CardContent className="flex flex-col items-start gap-4 py-10">
            <Heading level={2} className="text-xl tracking-tight">
              {t("emptyHeading")}
            </Heading>
            <Text className="text-muted-fg max-w-xl">{t("emptyBody")}</Text>
            <TextLink href="/claim">{t("emptyCta")}</TextLink>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {claims.map((c) => (
            <li key={c._id}>
              <Link
                href={`/dashboard/${c.slug}`}
                className="block h-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-colors hover:bg-muted/30">
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <CardTitle className="leading-tight">{c.name}</CardTitle>
                    <Badge intent={c.status === "published" ? "success" : "warning"}>
                      {t(`status.${c.status}`)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1">
                    {c.description ? (
                      <Text className="text-muted-fg line-clamp-3 text-sm">
                        {c.description}
                      </Text>
                    ) : null}
                    <Text className="text-muted-fg text-xs">
                      {t("editCta")} →
                    </Text>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
