import { LockClosedIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccessRevokedActions } from "@/components/access-revoked-actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export const metadata: Metadata = {
  title: "Access removed",
};

/**
 * Landing page for users whose portal access has been revoked by a
 * moderator. Static, calm, no chrome — the goal is to communicate the
 * status plainly and offer one constructive next step (contact support
 * or sign out).
 *
 * The redirect into this page happens client-side in PublicSiteShell
 * once `me.getRole.revoked` flips true, so a revoked user lands here
 * the moment they sign in (or the moment the moderator revokes them
 * while they're already in the app).
 */
export default async function AccessRevokedPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-12 sm:py-20">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col items-center gap-3 border-b border-border bg-muted/30 pb-6 pt-(--gutter) text-center">
          <div className="grid size-12 place-items-center rounded-full bg-fg/5 text-fg/70">
            <LockClosedIcon aria-hidden className="size-6" />
          </div>
          <div>
            <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
              Account status
            </Text>
            <Heading level={1} className="mt-1 text-2xl/tight font-semibold">
              Access has been removed
            </Heading>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pb-(--gutter) pt-(--gutter)">
          <Text className="text-sm leading-relaxed text-fg/85">
            A site moderator has removed your access to the management
            portal. You can still browse the public Startup Utah site, but
            you can no longer edit a claimed business listing or submit
            new content from this account.
          </Text>
          <Text className="text-sm leading-relaxed text-fg/85">
            If you believe this was done in error, please contact the
            Governor&rsquo;s Office of Economic Development with the email
            address on this account so the team can review your case.
          </Text>

          <AccessRevokedActions />
        </CardContent>
      </Card>
    </div>
  );
}
