"use client";

import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";

type Props = {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  children: ReactNode;
};

export function Providers({ locale, messages, timeZone, children }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <I18nProvider locale={locale}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </I18nProvider>
    </NextIntlClientProvider>
  );
}
