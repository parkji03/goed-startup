import { AdminHeaderToolbar } from "@/components/admin-header-toolbar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
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
      <div className="sticky top-0 z-30 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <StartupUtahLogoLink />
          <AdminHeaderToolbar locale={locale} publicSiteLabel={t("publicSite")} />
        </div>
      </div>
      {/* On lg+ the body padding lives on `<main>` rather than the flex
          container so the sidebar can sit flush against the sticky header
          — otherwise the parent's top padding leaves a visible gap above
          the rail before sticky engages. Mobile keeps the original
          parent-level spacing because the rail there is a horizontal pill
          row that wants breathing room from the header. */}
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-6 lg:flex-row lg:gap-8 lg:py-0">
        <AdminSidebar />
        <main className="min-w-0 flex-1 lg:py-6">{children}</main>
      </div>
    </>
  );
}
