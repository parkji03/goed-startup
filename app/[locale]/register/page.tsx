import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RegisterForm } from "@/components/onboarding/register-form";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "RegisterCompany" });
  return { title: t("title") };
}

export default async function RegisterCompanyPage({ params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "RegisterCompany" });

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex flex-col gap-3">
        <Heading level={1} className="text-3xl tracking-tight">
          {t("heading")}
        </Heading>
        <Text className="text-muted-fg">{t("blurb")}</Text>
      </div>
      <div className="mt-8">
        <RegisterForm />
      </div>
    </div>
  );
}
