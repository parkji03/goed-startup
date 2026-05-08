"use client";

import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { ConvexClerkRoot } from "@/components/convex-clerk-root";
import { ThemeProvider } from "@/components/theme-provider";

type Props = {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  children: ReactNode;
};

export function Providers({ locale, messages, timeZone, children }: Props) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        enableColorScheme
        storageKey="goed-theme"
      >
        <I18nProvider locale={locale}>
          <ConvexClerkRoot>{children}</ConvexClerkRoot>
        </I18nProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
