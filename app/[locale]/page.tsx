import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("HomePage");

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-between bg-white px-16 py-32 dark:bg-black sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt={t("nextLogoAlt")}
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl leading-10 font-semibold tracking-tight text-black dark:text-zinc-50">
            {t("heading")}
          </h1>
          <p className="max-w-md text-lg leading-8 text-zinc-600 dark:text-zinc-400">
            {t("introLead")}{" "}
            <a
              href={t("templatesHref")}
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              {t("introTemplates")}
            </a>{" "}
            {t("introOr")}{" "}
            <a
              href={t("learnHref")}
              className="font-medium text-zinc-950 dark:text-zinc-50"
            >
              {t("introLearning")}
            </a>{" "}
            {t("introTrail")}
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="bg-foreground text-background hover:bg-[#383838] dark:hover:bg-[#ccc] flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 transition-colors md:w-[158px]"
            href={t("deployHref")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert"
              src="/vercel.svg"
              alt={t("vercelLogoAlt")}
              width={16}
              height={16}
            />
            {t("deployNow")}
          </a>
          <a
            className="flex h-12 w-full items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] md:w-[158px] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            href={t("docsHref")}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("documentation")}
          </a>
        </div>
      </main>
    </div>
  );
}
