"use client";

import { NativeSelect, NativeSelectContent } from "@/components/ui/native-select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

export function LocaleSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LocaleSwitcher");
  const [, startTransition] = useTransition();

  return (
    <NativeSelect className="w-fit min-w-36">
      <NativeSelectContent
        aria-label={t("label")}
        value={locale}
        onChange={(e) => {
          const nextLocale = e.target.value;
          startTransition(() => {
            router.replace(pathname, { locale: nextLocale });
          });
        }}
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc}>
            {t(loc)}
          </option>
        ))}
      </NativeSelectContent>
    </NativeSelect>
  );
}
