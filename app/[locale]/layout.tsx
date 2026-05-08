import { LocaleSwitcher } from "@/components/locale-switcher";
import { Providers } from "@/components/providers";
import { routing } from "@/i18n/routing";
import { appTimeZone } from "@/i18n/time-zone";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isRTL } from "react-aria-components/I18nProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const locales = routing.locales as readonly string[];

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "LocaleLayout" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const messages = await getMessages();
  const timeZone = appTimeZone();
  const dir = isRTL(locale) ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <Providers locale={locale} messages={messages} timeZone={timeZone}>
          <header className="flex justify-end border-b border-black/5 px-4 py-3 dark:border-white/10">
            <LocaleSwitcher locale={locale} />
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
