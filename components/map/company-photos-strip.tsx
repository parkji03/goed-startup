"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "react-aria-components/Button";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ModalContent } from "@/components/ui/modal";

type Props = {
  companyId: Id<"companies">;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Small horizontal photo strip for the company detail panel. Each
 * thumbnail opens a full-size lightbox with prev/next navigation.
 * Self-suppresses when the company has no photos.
 *
 * Uses Convex storage URLs resolved server-side via
 * `companies.publicPhotosForCompany` — anonymous map visitors don't
 * need storage permission.
 */
export function CompanyPhotosStrip({ companyId, className, style }: Props) {
  const photos = useQuery(api.companies.publicPhotosForCompany, { companyId });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [trackedCompanyId, setTrackedCompanyId] = useState(companyId);

  // Reset selection when the underlying company changes (set-during-
  // render, guarded by an identity check). Avoids the cascading-render
  // anti-pattern flagged by react-hooks/set-state-in-effect — the
  // useState comparison short-circuits on the steady-state path.
  if (trackedCompanyId !== companyId) {
    setTrackedCompanyId(companyId);
    setActiveIndex(null);
  }

  if (!photos || photos.length === 0) return null;

  const usable = photos.filter((p): p is { storageId: Id<"_storage">; url: string } =>
    Boolean(p.url),
  );
  if (usable.length === 0) return null;

  const close = () => setActiveIndex(null);
  const open = (i: number) => setActiveIndex(i);
  const next = () =>
    setActiveIndex((cur) =>
      cur === null ? null : (cur + 1) % usable.length,
    );
  const prev = () =>
    setActiveIndex((cur) =>
      cur === null ? null : (cur - 1 + usable.length) % usable.length,
    );

  const active = activeIndex !== null ? usable[activeIndex] : null;

  return (
    <>
      <ul
        className={`flex gap-2 overflow-x-auto pb-1 ${className ?? ""}`}
        style={style}
      >
        {usable.map((p, i) => (
          <li key={p.storageId} className="shrink-0">
            <Button
              type="button"
              onPress={() => open(i)}
              className="block size-16 overflow-hidden rounded-lg border border-border bg-muted transition-transform hover:scale-[1.02] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:size-20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL, not a known domain */}
              <img
                src={p.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </Button>
          </li>
        ))}
      </ul>

      <ModalContent
        isOpen={active !== null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        role="dialog"
        size="4xl"
        aria-label="Photo viewer"
        className="bg-overlay p-0"
      >
        <div className="relative">
          {active && (
            // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL
            <img
              src={active.url}
              alt=""
              className="block max-h-[80vh] w-full object-contain"
            />
          )}
          {usable.length > 1 ? (
            <>
              <Button
                type="button"
                onPress={prev}
                aria-label="Previous photo"
                className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg/90 text-fg shadow-sm backdrop-blur transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronLeftIcon className="size-5" aria-hidden />
              </Button>
              <Button
                type="button"
                onPress={next}
                aria-label="Next photo"
                className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg/90 text-fg shadow-sm backdrop-blur transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronRightIcon className="size-5" aria-hidden />
              </Button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-bg/90 px-3 py-1 text-xs font-medium text-fg shadow-sm backdrop-blur">
                {activeIndex! + 1} / {usable.length}
              </div>
            </>
          ) : null}
        </div>
      </ModalContent>
    </>
  );
}
