"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Floating CTA pinned bottom-center of the map. Always visible — doesn't
 * fight the top-left FloatingFilterBar or the right-side detail panel
 * (the panel docks above this element on small screens via z-index).
 *
 * Anonymous-friendly: links straight to `/register` without any auth gate.
 */
export function MapSubmitBusinessCta() {
  const t = useTranslations("MapCta");
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4 sm:px-6 sm:pb-6">
      <Link
        href="/register"
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-border bg-bg/95 px-4 py-2.5 text-sm font-medium text-fg shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)] backdrop-blur-md transition-colors hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <span className="text-muted-fg">{t("submitYourBusiness")}</span>
        <span className="text-primary-subtle-fg">
          {t("submitYourBusinessAction")}
        </span>
      </Link>
    </div>
  );
}
