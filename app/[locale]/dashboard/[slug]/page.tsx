import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardEditClient } from "@/components/dashboard/dashboard-edit-client";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("title") };
}

export default async function DashboardEditPage({ params }: Readonly<Props>) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  return <DashboardEditClient slug={slug} />;
}
