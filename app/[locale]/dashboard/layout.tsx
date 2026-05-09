import { currentUser } from "@clerk/nextjs/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { DashboardHeaderToolbar } from "@/components/dashboard/dashboard-header-toolbar";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function DashboardLayout({ children, params }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await currentUser();
  if (!user) {
    redirect({ href: "/sign-in", locale });
  }

  const t = await getTranslations({ locale, namespace: "Dashboard" });

  return (
    <>
      <div className="sticky top-0 z-30 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <StartupUtahLogoLink />
          <DashboardHeaderToolbar locale={locale} publicSiteLabel={t("publicSite")} />
        </div>
      </div>
      <div className="mx-auto max-w-6xl flex-1 px-4 py-6">{children}</div>
    </>
  );
}
