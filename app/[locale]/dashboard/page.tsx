import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardHomeClient } from "@/components/dashboard/dashboard-home-client";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("title") };
}

export default async function DashboardHomePage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DashboardHomeClient />;
}
