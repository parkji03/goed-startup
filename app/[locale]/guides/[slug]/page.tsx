import { GuideDetailClient } from "@/components/guides/guide-detail-client";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function GuideSlugPage({ params }: Readonly<Props>) {
  const { slug } = await params;
  return <GuideDetailClient slug={slug} />;
}
