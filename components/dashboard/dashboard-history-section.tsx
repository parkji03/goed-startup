"use client";

import { ClockIcon, ShieldCheckIcon, UserIcon } from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Description } from "@/components/ui/field";
import { Text } from "@/components/ui/text";

/**
 * Audit-trail section. Shows every entry in `companies.diffLog` with
 * the editor's email + an owner / admin badge so the team can see who
 * touched what and when. Visible to anyone who can edit the company
 * (owner or admin) — same gate as the rest of the dashboard.
 */
export function DashboardHistorySection({
  companyId,
}: {
  companyId: Id<"companies">;
}) {
  const t = useTranslations("Dashboard.history");
  const entries = useQuery(api.companyDashboard.myCompanyHistory, {
    companyId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <Description>{t("subtitle")}</Description>
      </CardHeader>
      <CardContent>
        {entries === undefined ? (
          <Text className="text-muted-fg text-sm">{t("loading")}</Text>
        ) : entries === null || entries.length === 0 ? (
          <Text className="text-muted-fg text-sm">{t("empty")}</Text>
        ) : (
          <ol className="flex flex-col gap-3">
            {entries.map((entry, i) => (
              <li
                key={`${entry.timestamp}-${i}`}
                className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={
                      entry.mode === "admin"
                        ? "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300"
                        : "inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                    }
                  >
                    {entry.mode === "admin" ? (
                      <ShieldCheckIcon className="size-3" aria-hidden />
                    ) : (
                      <UserIcon className="size-3" aria-hidden />
                    )}
                    {entry.mode === "admin"
                      ? t("modeAdmin")
                      : entry.mode === "owner"
                        ? t("modeOwner")
                        : t("modeUnknown")}
                  </span>
                  <Text className="text-sm font-medium text-fg">
                    {entry.editorEmail ?? t("unknownEditor")}
                  </Text>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-fg">
                    <ClockIcon className="size-3" aria-hidden />
                    {new Date(entry.timestamp).toLocaleString()}
                  </span>
                </div>
                {entry.changedFields.length > 0 ? (
                  <Text className="text-xs text-muted-fg">
                    {t("changedPrefix")}{" "}
                    <span className="font-mono text-fg">
                      {entry.changedFields.join(", ")}
                    </span>
                  </Text>
                ) : (
                  <Text className="text-xs italic text-muted-fg">
                    {t("noFieldsRecorded")}
                  </Text>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
