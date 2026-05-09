import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { AdminAllowlistCard } from "@/components/admin/admin-allowlist-card";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminHome" });
  return { title: t("title") };
}

export default async function AdminHomePage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await currentUser();

  const fullName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.firstName ?? user?.username ?? null;
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Initials fallback when Clerk hasn't issued an avatar URL — uses the
  // first letter of the chosen display source so we always render
  // *something* recognisable.
  const initials = (fullName ?? email ?? "?")
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  // Greeting prefers a first name, then the email local-part, then a
  // generic fallback. Keeps the heading short and personal.
  const greetingName =
    user?.firstName ?? (email ? email.split("@")[0] : null) ?? "admin";

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-4 sm:gap-5">
          <Avatar
            src={user?.imageUrl ?? null}
            initials={initials}
            alt={fullName ?? email ?? "Admin avatar"}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading level={1} className="text-xl/tight font-semibold sm:text-2xl/tight">
                Welcome back, {greetingName}
              </Heading>
              <Badge intent="primary" isCircle={false}>
                Admin
              </Badge>
            </div>
            {email && (
              <Text className="mt-1 truncate text-sm text-muted-fg">
                {email}
              </Text>
            )}
          </div>
        </CardContent>
      </Card>

      <AdminAllowlistCard />
    </div>
  );
}

/**
 * Round, gradient-bordered avatar. Renders Clerk's hosted image when
 * available; falls back to the user's initials on a soft tinted disc so
 * the card never has an empty hole.
 */
function Avatar({
  src,
  initials,
  alt,
}: {
  src: string | null;
  initials: string;
  alt: string;
}) {
  return (
    <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-border sm:size-16">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Clerk-hosted, dynamic per session
        <img
          src={src}
          alt={alt}
          className="size-full object-cover"
        />
      ) : (
        <span className="grid size-full place-items-center text-base font-semibold text-fg/80 sm:text-lg">
          {initials}
        </span>
      )}
    </div>
  );
}
