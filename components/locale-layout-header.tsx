"use client";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { usePathname } from "@/i18n/navigation";

type Props = {
  locale: string;
};

export function LocaleLayoutHeader({ locale }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <StartupUtahLogoLink />
      <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
        <LocaleSwitcher locale={locale} />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
