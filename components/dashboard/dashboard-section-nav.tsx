"use client";

import { useTranslations } from "next-intl";
import { twMerge } from "tailwind-merge";

/**
 * Section anchors used on the company edit page. Kept as a const tuple
 * so the same id is shared between the form section wrappers and these
 * nav links — TypeScript catches any drift.
 */
export const DASHBOARD_EDIT_SECTION_IDS = [
  "about",
  "classification",
  "hiring",
  "brief",
  "location",
  "photos",
  "listings",
  "history",
] as const;

export type DashboardSectionId = (typeof DASHBOARD_EDIT_SECTION_IDS)[number];

/**
 * Sticky in-page nav for the company edit form. Mirrors the admin
 * sidebar's pattern (left rail on lg+, horizontal pill row on mobile)
 * so the layout idiom is consistent across the two surfaces.
 */
export function DashboardSectionNav() {
  const t = useTranslations("Dashboard.sectionNav");

  const items: Array<{ id: DashboardSectionId; label: string }> = [
    { id: "about", label: t("about") },
    { id: "classification", label: t("classification") },
    { id: "hiring", label: t("hiring") },
    { id: "brief", label: t("brief") },
    { id: "location", label: t("location") },
    { id: "photos", label: t("photos") },
    { id: "listings", label: t("listings") },
    { id: "history", label: t("history") },
  ];

  return (
    <nav
      aria-label={t("ariaLabel")}
      // Same shape as the admin rail: horizontal pill row on mobile,
      // sticky vertical rail on lg+ that fills the viewport so the
      // right-side divider runs top-to-bottom. Top offset matches the
      // dashboard layout's sticky header height.
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border pb-3 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-56 lg:flex-col lg:gap-0.5 lg:self-start lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className={twMerge(
            "shrink-0 rounded-md px-3 py-2 text-sm font-medium text-muted-fg transition-colors hover:bg-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
