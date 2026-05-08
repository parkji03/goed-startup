import { AdminHeaderToolbar } from "@/components/admin-header-toolbar";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { clerkUiAllowedFromHeaders } from "@/lib/clerk-admin-scope";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Readonly<Props>) {
  const { locale } = await params;
  const h = await headers();
  const allowed = await clerkUiAllowedFromHeaders((name) => h.get(name));

  if (!allowed) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "AdminHeader" });

  return (
    <>
      <div className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <StartupUtahLogoLink />
          <AdminHeaderToolbar locale={locale} publicSiteLabel={t("publicSite")} />
        </div>
      </div>
      <div className="mx-auto max-w-6xl flex-1 px-4 py-6">{children}</div>
    </>
  );
}
