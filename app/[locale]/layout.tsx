import { Providers } from "@/components/providers";
import { PublicSiteShell } from "@/components/public-site-shell";
import { routing } from "@/i18n/routing";
import { appTimeZone } from "@/i18n/time-zone";
import { SITE_NAME, SITE_URL } from "@/lib/seo";
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
  const title = t("title");
  const description = t("description");

  // Locale-prefixed canonical so /en, /es each have their own canonical
  // page and the alternates map points crawlers at the other variant.
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  const localeAlternates = Object.fromEntries(
    routing.locales.map((l) => [
      l,
      `${SITE_URL}${l === routing.defaultLocale ? "" : `/${l}`}`,
    ]),
  );

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s · ${SITE_NAME}`,
    },
    description,
    applicationName: SITE_NAME,
    alternates: {
      canonical: `${localePath}/`,
      languages: {
        ...localeAlternates,
        "x-default": SITE_URL,
      },
    },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title,
      description,
      url: `${SITE_URL}${localePath}/`,
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    icons: {
      icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    },
    robots: {
      index: true,
      follow: true,
    },
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
          <PublicSiteShell locale={locale}>{children}</PublicSiteShell>
        </Providers>
      </body>
    </html>
  );
}
