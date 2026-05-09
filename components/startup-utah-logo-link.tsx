"use client";

import { useTranslations } from "next-intl";
import { twMerge } from "tailwind-merge";
import { Link } from "@/i18n/navigation";
import { StartupUtahLogo } from "@/components/startup-utah-logo";

type Props = {
  className?: string | undefined;
};

/** Homepage link wrapping the Utah Startup State logo (startup.utah.gov). */
export function StartupUtahLogoLink({ className }: Props) {
  const t = useTranslations("Brand");

  return (
    <Link
      href="/"
      aria-label={t("logoAlt")}
      className={twMerge(
        "-m-1 inline-flex shrink-0 rounded-md p-0.5 outline-0 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:p-1",
        className,
      )}
    >
      <StartupUtahLogo />
    </Link>
  );
}
