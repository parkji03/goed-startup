import { InboxIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminInboxClient } from "@/components/admin/admin-inbox-client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Inbox · Admin",
};

export default async function AdminInboxPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="space-y-6">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
          <div className="flex items-center gap-2 text-muted-fg">
            <InboxIcon aria-hidden className="size-5" />
            <Text className="text-xs font-semibold tracking-wide uppercase">
              Moderation queue
            </Text>
          </div>
          <Heading level={1} className="mt-3 sm:text-2xl/8">
            Inbox
          </Heading>
          <Text className="mt-1 text-sm text-muted-fg">
            Pending business registrations and claim requests. Approve marks the
            item resolved; full account-binding for approved claims is still
            future work.
          </Text>
        </CardHeader>

        <CardContent className="space-y-3 pb-(--gutter) pt-(--gutter)">
          <AdminInboxClient />
        </CardContent>
      </Card>
    </div>
  );
}
