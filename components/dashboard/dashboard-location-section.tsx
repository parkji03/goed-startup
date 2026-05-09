"use client";

import { ExclamationTriangleIcon, MapPinIcon } from "@heroicons/react/20/solid";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Description, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";

/**
 * Address editor with its own save action. Edits land in
 * `companies.location` after a Mapbox round trip — kept off the bulk
 * save form because (a) the network call is conditional on the address
 * actually changing, and (b) we want to surface the geocoded result
 * (or failure) inline so owners know whether their pin will appear on
 * the map.
 */
export function DashboardLocationSection({
  company,
}: {
  company: Doc<"companies">;
}) {
  const t = useTranslations("Dashboard.location");
  const updateLocation = useAction(
    api.companyDashboard.updateMyCompanyLocation,
  );

  const initial = company.location.rawAddress;
  const [rawAddress, setRawAddress] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{
    geocoded: boolean;
    at: number;
  } | null>(null);

  const trimmed = rawAddress.trim();
  const dirty = trimmed.length > 0 && trimmed !== initial;
  const hasCoords =
    company.location.lat != null && company.location.lng != null;

  const onSubmit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const result = await updateLocation({
        companyId: company._id as Id<"companies">,
        rawAddress: trimmed,
      });
      setLastResult({ geocoded: result.geocoded, at: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Compose a one-line summary of the resolved coords. Falls back to
  // the saved values on the doc — Convex re-queries elsewhere will pick
  // up the patch and re-render with fresh data.
  const summary = formatLocationSummary(company.location);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("heading")}</CardTitle>
        <Description>{t("subtitle")}</Description>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TextField value={rawAddress} onChange={setRawAddress}>
          <Label>{t("fieldRawAddress")}</Label>
          <Input placeholder={t("placeholder")} />
          <Description>{t("hint")}</Description>
        </TextField>

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
          <MapPinIcon
            className="mt-0.5 size-4 shrink-0 text-muted-fg"
            aria-hidden
          />
          <div className="flex flex-col gap-0.5">
            <Text className="text-xs font-medium text-muted-fg">
              {t("currentResolved")}
            </Text>
            {hasCoords ? (
              <Text className="text-sm">{summary}</Text>
            ) : (
              <Text className="text-sm text-muted-fg">
                {t("currentNoCoords")}
              </Text>
            )}
          </div>
        </div>

        {/* Most-recent save outcome — shows whether the geocode
            succeeded so owners learn immediately if their address was
            unparseable. The doc itself updates via the live query. */}
        {lastResult && !lastResult.geocoded ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <ExclamationTriangleIcon
              className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
              aria-hidden
            />
            <Text className="text-sm text-amber-900 dark:text-amber-100">
              {t("warnGeocodeFailed")}
            </Text>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            intent="primary"
            isDisabled={!dirty || saving}
            onPress={onSubmit}
          >
            {saving ? t("saving") : t("saveAction")}
          </Button>
          {!dirty && lastResult === null ? (
            <Text className="text-muted-fg text-sm">{t("noChanges")}</Text>
          ) : null}
          {lastResult && !dirty ? (
            <Text className="text-muted-fg text-sm">
              {t("savedAt", {
                time: new Date(lastResult.at).toLocaleTimeString(),
              })}
            </Text>
          ) : null}
          {error ? (
            <Text className="text-danger-subtle-fg text-sm">
              {t("saveError", { message: error })}
            </Text>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatLocationSummary(loc: Doc<"companies">["location"]): string {
  const parts = [loc.city, loc.state].filter(
    (s): s is string => Boolean(s && s.length),
  );
  const place = parts.join(", ");
  if (loc.lat != null && loc.lng != null) {
    const coords = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    return place ? `${place} (${coords})` : coords;
  }
  return place;
}
