import { setRequestLocale } from "next-intl/server";
import { ResourcesBrowseClient } from "@/components/resources/resources-browse-client";

export default async function Home({
  params,
}: Readonly<{
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ResourcesBrowseClient />;
}
