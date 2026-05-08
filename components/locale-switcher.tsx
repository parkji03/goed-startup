"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

type LocaleItem = { id: string; label: string };

export function LocaleSwitcher({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LocaleSwitcher");
  const [, startTransition] = useTransition();

  const items: LocaleItem[] = routing.locales.map((code) => ({
    id: code,
    label: t(code),
  }));

  const triggerClassName =
    "h-8 min-h-8 w-[min(100%,6.75rem)] **:data-[slot=select-value]:text-xs/4 sm:h-7 sm:min-h-7 sm:px-2 sm:py-1 sm:*:text-xs/4 **:[data-slot=chevron]:size-3.5 sm:**:[data-slot=chevron]:size-3";

  const rootClassName = "w-[min(100%,6.75rem)] shrink-0";

  return (
    <Select
      aria-label={t("label")}
      className={rootClassName}
      selectedKey={locale}
      onSelectionChange={(key) => {
        if (key == null) return;
        startTransition(() => {
          router.replace(pathname, { locale: String(key) });
        });
      }}
    >
      <SelectTrigger className={triggerClassName} />
      <SelectContent items={items}>
        {(item) => (
          <SelectItem id={item.id} textValue={item.label}>
            <SelectLabel>{item.label}</SelectLabel>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
