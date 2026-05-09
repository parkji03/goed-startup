"use client";

import { GlobalCommandTrigger } from "@/components/global-command-trigger";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Link, usePathname } from "@/i18n/navigation";

type Props = {
  locale: string;
};

export function LocaleLayoutHeader({ locale }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
      <StartupUtahLogoLink />
      <nav className="hidden flex-1 flex-wrap items-center justify-center gap-3 lg:flex">
        <Link href="/resources" className="text-muted-fg text-sm hover:text-fg">
          Resources
        </Link>
        <Link href="/quiz" className="text-muted-fg text-sm hover:text-fg">
          Questionnaire
        </Link>
        <Link href="/guide" className="text-muted-fg text-sm hover:text-fg">
          Guide
        </Link>
        <Link href="/resources/submit" className="text-muted-fg text-sm hover:text-fg">
          Submit
        </Link>
      </nav>
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
        <GlobalCommandTrigger />
        <LocaleSwitcher locale={locale} />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
