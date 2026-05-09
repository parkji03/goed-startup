import { BuildingOffice2Icon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminCompaniesClient } from "@/components/admin/admin-companies-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Companies · Admin",
};

export default async function AdminCompaniesPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
        <div className="flex items-center gap-2 text-muted-fg">
          <BuildingOffice2Icon aria-hidden className="size-5" />
          <Text className="text-xs font-semibold tracking-wide uppercase">
            All companies
          </Text>
        </div>
        <Heading level={1} className="mt-3 sm:text-2xl/8">
          Companies
        </Heading>
        <Text className="mt-1 text-sm text-muted-fg">
          Every company in the directory. Click one to edit it from the owner
          dashboard — admin edits are tracked in the audit log alongside owner
          edits.
        </Text>
      </CardHeader>

      <CardContent className="space-y-3 pb-(--gutter) pt-(--gutter)">
        <AdminCompaniesClient />
      </CardContent>
    </Card>
  );
}
