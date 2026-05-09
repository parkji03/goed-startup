"use client";

import { UserButton } from "@clerk/nextjs";
import { twMerge } from "tailwind-merge";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { buttonStyles } from "@/components/ui/button";

type Props = {
  locale: string;
  publicSiteLabel: string;
};

export function DashboardHeaderToolbar({ locale, publicSiteLabel }: Props) {
  return (
    <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
      <Link
        href="/"
        className={twMerge(
          buttonStyles({ intent: "outline", size: "xs" }),
          "shrink-0 whitespace-nowrap",
        )}
      >
        {publicSiteLabel}
      </Link>
      <LocaleSwitcher locale={locale} />
      <ThemeSwitcher />
      <UserButton />
    </div>
  );
}
