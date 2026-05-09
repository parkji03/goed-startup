"use client";

import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { I18nProvider, RouterProvider } from "react-aria-components";
import { ConvexClerkRoot } from "@/components/convex-clerk-root";
import { ThemeProvider } from "@/components/theme-provider";
import { useRouter } from "@/i18n/navigation";

type Props = {
  locale: string;
  messages: AbstractIntlMessages;
  timeZone: string;
  children: ReactNode;
};

function ReactAriaRouterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  return <RouterProvider navigate={router.push}>{children}</RouterProvider>;
}

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
          <ReactAriaRouterProvider>
            <ConvexClerkRoot>{children}</ConvexClerkRoot>
          </ReactAriaRouterProvider>
        </I18nProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
