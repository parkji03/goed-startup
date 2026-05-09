import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminUsersClient } from "@/components/admin/admin-users-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Users · Admin",
};

export default async function AdminUsersPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="space-y-6">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
          <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
            Access management
          </Text>
          <Heading level={1} className="mt-1 sm:text-2xl/8">
            Users
          </Heading>
          <Text className="mt-1 text-sm text-muted-fg">
            Owners who&rsquo;ve claimed a business listing, plus accounts whose
            access has been removed. Revoking sends the user to an
            access-removed page on their next request.
          </Text>
        </CardHeader>

        <CardContent className="space-y-6 pb-(--gutter) pt-(--gutter)">
          <AdminUsersClient />
        </CardContent>
      </Card>
    </div>
  );
}
