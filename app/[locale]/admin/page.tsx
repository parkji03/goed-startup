import { CheckIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Code, Text } from "@/components/ui/text";

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
  const [t, user] = await Promise.all([
    getTranslations({ locale, namespace: "AdminHome" }),
    currentUser(),
  ]);

  const displayName =
    user?.firstName && user?.lastName
      ? `${user.firstName} ${user.lastName}`
      : user?.username ??
        user?.primaryEmailAddress?.emailAddress ??
        user?.id;

  const bullets = [
    t("bulletResources"),
    t("bulletCompanies"),
    t("bulletChat"),
    t("bulletDistinct"),
  ] as const;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
        <div className="flex flex-wrap items-center gap-3">
          <Badge intent="warning" isCircle={false}>
            {t("badge")}
          </Badge>
          <Text className="text-sm font-medium text-muted-fg">{t("tagline")}</Text>
        </div>
        <Heading level={1} className="mt-3 sm:text-2xl/8">
          {t("heading")}
        </Heading>
      </CardHeader>

      <CardContent className="space-y-6 pb-(--gutter) pt-(--gutter)">
        <div className="rounded-lg border border-dashed border-border bg-muted/60 px-4 py-3">
          <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
            {t("sessionLabel")}
          </Text>
          <Code className="mt-1 block font-mono text-sm text-fg">{displayName}</Code>
        </div>

        <Text className="max-w-prose">{t("blurb")}</Text>

        <ul className="grid gap-2 text-sm text-muted-fg sm:grid-cols-2">
          {bullets.map((label) => (
            <li
              key={label}
              className="flex gap-2 rounded-md bg-muted px-3 py-2"
            >
              <CheckIcon
                aria-hidden
                className="size-4 shrink-0 text-primary-subtle-fg"
              />
              {label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
