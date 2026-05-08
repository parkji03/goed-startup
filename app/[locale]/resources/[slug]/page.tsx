import { ResourceDetailClient } from "@/components/resources/resource-detail-client";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export default async function ResourceSlugPage({ params }: Readonly<Props>) {
  const { slug } = await params;
  return <ResourceDetailClient slug={slug} />;
}
