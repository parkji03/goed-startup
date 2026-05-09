"use client";

import { TrashIcon } from "@heroicons/react/20/solid";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Description } from "@/components/ui/field";
import { FileTrigger } from "@/components/ui/file-trigger";
import { Text } from "@/components/ui/text";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export function DashboardPhotosSection({
  companyId,
}: {
  companyId: Id<"companies">;
}) {
  const t = useTranslations("Dashboard.photos");
  const photos = useQuery(api.companyDashboard.myCompanyPhotos, { companyId });
  const generateUrl = useMutation(api.companyDashboard.generatePhotoUploadUrl);
  const attach = useMutation(api.companyDashboard.attachPhoto);
  const remove = useMutation(api.companyDashboard.deletePhoto);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setError(null);

    // Validate up front so a bad file in the batch doesn't leave half
    // a state behind. The server still gates on its own MAX cap.
    for (const f of list) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError(t("errorBadType", { name: f.name }));
        return;
      }
      if (f.size > MAX_BYTES) {
        setError(t("errorTooLarge", { name: f.name }));
        return;
      }
    }

    setUploading(true);
    try {
      // Upload sequentially so the server-side cap check on
      // `generatePhotoUploadUrl` reflects the prior attaches in the
      // same batch. Photos are small in practice, so the latency cost
      // is acceptable.
      for (const file of list) {
        const url = await generateUrl({ companyId });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!res.ok) {
          throw new Error(`Upload failed (${res.status}).`);
        }
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        await attach({ companyId, storageId });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (storageId: Id<"_storage">) => {
    setError(null);
    try {
      await remove({ companyId, storageId });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{t("heading")}</CardTitle>
          <Description>{t("subtitle")}</Description>
        </div>
        <FileTrigger
          allowsMultiple
          acceptedFileTypes={ACCEPTED_TYPES}
          isPending={uploading}
          onSelect={handleSelect}
        >
          {uploading ? t("uploading") : t("addAction")}
        </FileTrigger>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <Text className="text-danger-subtle-fg text-sm">{error}</Text>
        ) : null}

        {photos === undefined ? (
          <Text className="text-muted-fg text-sm">{t("loading")}</Text>
        ) : photos === null ? (
          <Text className="text-muted-fg text-sm">{t("empty")}</Text>
        ) : photos.length === 0 ? (
          <Text className="text-muted-fg text-sm">{t("empty")}</Text>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <li
                key={photo.storageId}
                className="group relative overflow-hidden rounded-lg border border-border bg-muted"
              >
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL, can't use next/image
                  <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                  />
                ) : (
                  <div className="aspect-square w-full" />
                )}
                <Button
                  size="xs"
                  intent="outline"
                  onPress={() => handleDelete(photo.storageId)}
                  aria-label={t("deleteAction")}
                  className="absolute right-2 top-2 bg-bg/90 backdrop-blur"
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Text className="text-muted-fg text-xs">
          {t("hint", { max: 10, sizeMb: 5 })}
        </Text>
      </CardContent>
    </Card>
  );
}
