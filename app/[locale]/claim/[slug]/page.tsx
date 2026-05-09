import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ClaimForm } from "@/components/onboarding/claim-form";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ClaimCompany" });
  return { title: t("title") };
}

export default async function ClaimCompanyPage({ params }: Readonly<Props>) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <ClaimForm slug={slug} />
    </div>
  );
}
