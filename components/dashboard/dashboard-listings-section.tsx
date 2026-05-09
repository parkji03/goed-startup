"use client";

import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/20/solid";
import { useMutation, useQuery } from "convex/react";
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

type Listing = Doc<"companyJobPostings">;

/**
 * Listings manager — independent CRUD that lives next to the main edit
 * form. Keeps its own state so an unsaved listing edit doesn't sit in
 * limbo with the company-info save bar.
 */
export function DashboardListingsSection({
  companyId,
}: {
  companyId: Id<"companies">;
}) {
  const t = useTranslations("Dashboard.listings");
  const listings = useQuery(api.companyDashboard.myCompanyListings, {
    companyId,
  });
  const create = useMutation(api.companyDashboard.createMyListing);

  const [draft, setDraft] = useState<{
    title: string;
    url: string;
    department: string;
    location: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onAdd = () =>
    setDraft({ title: "", url: "", department: "", location: "" });
  const onCancelAdd = () => {
    setDraft(null);
    setError(null);
  };
  const onSaveAdd = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      await create({
        companyId,
        title: draft.title,
        url: draft.url,
        department: draft.department || undefined,
        location: draft.location || undefined,
      });
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{t("heading")}</CardTitle>
          <Description>{t("subtitle")}</Description>
        </div>
        {draft === null ? (
          <Button size="sm" intent="outline" onPress={onAdd}>
            {t("addAction")}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {draft !== null ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                value={draft.title}
                onChange={(title) => setDraft({ ...draft, title })}
                isRequired
              >
                <Label>{t("fieldTitle")}</Label>
                <Input />
              </TextField>
              <TextField
                value={draft.url}
                onChange={(url) => setDraft({ ...draft, url })}
                type="url"
                isRequired
              >
                <Label>{t("fieldUrl")}</Label>
                <Input placeholder="https://" />
              </TextField>
              <TextField
                value={draft.department}
                onChange={(department) => setDraft({ ...draft, department })}
              >
                <Label>{t("fieldDepartment")}</Label>
                <Input />
              </TextField>
              <TextField
                value={draft.location}
                onChange={(location) => setDraft({ ...draft, location })}
              >
                <Label>{t("fieldLocation")}</Label>
                <Input />
              </TextField>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                intent="primary"
                size="sm"
                isDisabled={busy}
                onPress={onSaveAdd}
              >
                {busy ? t("saving") : t("saveAction")}
              </Button>
              <Button
                intent="outline"
                size="sm"
                isDisabled={busy}
                onPress={onCancelAdd}
              >
                Cancel
              </Button>
              {error ? (
                <Text className="text-danger-subtle-fg text-sm">
                  {t("errorPrefix", { message: error })}
                </Text>
              ) : null}
            </div>
          </div>
        ) : null}

        {listings === undefined ? (
          <Text className="text-muted-fg text-sm">Loading…</Text>
        ) : listings === null ? (
          <Text className="text-muted-fg text-sm">{t("empty")}</Text>
        ) : listings.length === 0 ? (
          <Text className="text-muted-fg text-sm">{t("empty")}</Text>
        ) : (
          <ul className="flex flex-col gap-2">
            {listings.map((l) => (
              <ListingRow key={l._id} listing={l} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ListingRow({ listing }: { listing: Listing }) {
  const t = useTranslations("Dashboard.listings");
  const update = useMutation(api.companyDashboard.updateMyListing);
  const remove = useMutation(api.companyDashboard.deleteMyListing);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    title: listing.title,
    url: listing.url,
    department: listing.department ?? "",
    location: listing.location ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await update({
        listingId: listing._id,
        title: draft.title,
        url: draft.url,
        department: draft.department,
        location: draft.location,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await remove({ listingId: listing._id });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-3">
      {listing.source === "linkedin" ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <ExclamationTriangleIcon
            className="size-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden
          />
          <Text className="text-xs text-amber-800 dark:text-amber-200">
            {t("linkedinWarning")}
          </Text>
        </div>
      ) : null}

      {editing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            value={draft.title}
            onChange={(title) => setDraft({ ...draft, title })}
            isRequired
          >
            <Label>{t("fieldTitle")}</Label>
            <Input />
          </TextField>
          <TextField
            value={draft.url}
            onChange={(url) => setDraft({ ...draft, url })}
            type="url"
            isRequired
          >
            <Label>{t("fieldUrl")}</Label>
            <Input />
          </TextField>
          <TextField
            value={draft.department}
            onChange={(department) => setDraft({ ...draft, department })}
          >
            <Label>{t("fieldDepartment")}</Label>
            <Input />
          </TextField>
          <TextField
            value={draft.location}
            onChange={(location) => setDraft({ ...draft, location })}
          >
            <Label>{t("fieldLocation")}</Label>
            <Input />
          </TextField>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-fg hover:underline"
          >
            {listing.title}
          </a>
          <Text className="text-muted-fg text-xs">
            {[listing.department, listing.location].filter(Boolean).join(" · ") ||
              " "}
          </Text>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <>
            <Button
              intent="primary"
              size="sm"
              isDisabled={busy}
              onPress={onSave}
            >
              {busy ? t("saving") : t("saveAction")}
            </Button>
            <Button
              intent="outline"
              size="sm"
              isDisabled={busy}
              onPress={() => {
                setEditing(false);
                setDraft({
                  title: listing.title,
                  url: listing.url,
                  department: listing.department ?? "",
                  location: listing.location ?? "",
                });
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              intent="outline"
              size="sm"
              isDisabled={busy}
              onPress={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              intent="outline"
              size="sm"
              isDisabled={busy}
              onPress={onDelete}
            >
              <TrashIcon className="size-3.5" aria-hidden />
              {t("deleteAction")}
            </Button>
          </>
        )}
        {error ? (
          <Text className="text-danger-subtle-fg text-sm">
            {t("errorPrefix", { message: error })}
          </Text>
        ) : null}
      </div>
    </li>
  );
}
