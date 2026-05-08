import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getTranslations, setRequestLocale } from "next-intl/server";

const locales = routing.locales as readonly string[];

export default async function NotFound({
  params,
}: Readonly<{
  params?: Promise<{ locale?: string }>;
}>) {
  const paramLocale = (await params)?.locale;
  const locale =
    paramLocale && locales.includes(paramLocale)
      ? paramLocale
      : routing.defaultLocale;

  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "NotFoundPage" });

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-fg max-w-md text-center">{t("body")}</p>
      <Link href="/" className="text-fg font-medium underline underline-offset-4">
        {t("homeLink")}
      </Link>
    </div>
  );
}
