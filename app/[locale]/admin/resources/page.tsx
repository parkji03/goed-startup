import { ListBulletIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminResourcesClient } from "@/components/admin/admin-resources-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Resources · Admin",
};

export default async function AdminResourcesPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
        <div className="flex items-center gap-2 text-muted-fg">
          <ListBulletIcon aria-hidden className="size-5" />
          <Text className="text-xs font-semibold tracking-wide uppercase">
            All resources
          </Text>
        </div>
        <Heading level={1} className="mt-3 sm:text-2xl/8">
          Resources
        </Heading>
        <Text className="mt-1 text-sm text-muted-fg">
          Every program, fund, and partner listed on the public home page.
          Edit any row, add new resources, or change a resource&rsquo;s
          publish state. Edits re-index search and re-embed for the AI guide
          automatically.
        </Text>
      </CardHeader>

      <CardContent className="space-y-3 pb-(--gutter) pt-(--gutter)">
        <AdminResourcesClient />
      </CardContent>
    </Card>
  );
}
