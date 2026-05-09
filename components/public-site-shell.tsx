"use client";

import { SparklesIcon } from "@heroicons/react/20/solid";
import { LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useGlobalMetaCtrlKeyToggle } from "@/hooks/use-global-keyboard-toggle";
import { GuideChatPanel } from "@/components/guide/guide-chat-panel";
import { GlobalCommandTrigger } from "@/components/global-command-trigger";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import {
  Navbar,
  NavbarMobile,
  NavbarProvider,
  NavbarTrigger,
  useNavbar,
} from "@/components/ui/navbar";
import {
  Sidebar,
  SidebarContent,
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, usePathname } from "@/i18n/navigation";

type Props = {
  children: ReactNode;
  locale: string;
};

const navItems = [
  { href: "/" as const, label: "Resources" },
  { href: "/map" as const, label: "Map" },
];

/**
 * Viewports narrower than this use the compact header (top rail + sheet + FAB).
 * Matches Tailwind `lg` so the layout lines up with `lg:` utilities.
 */
const HEADER_COMPACT_MAX_PX = 1023;
const HEADER_COMPACT_MEDIA_QUERY = `(max-width: ${HEADER_COMPACT_MAX_PX}px)`;

/** Below this viewport width the AI panel uses a Sheet; above it docks as a fixed panel. */
const AI_PANEL_MOBILE_MEDIA = "(max-width: 1279px)";

const isMacEnv =
  typeof navigator !== "undefined" && /Mac|iPad|iPhone|iPod/.test(navigator.platform);

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/resources");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function HeaderNavLink({
  pathname,
  href,
  label,
  className,
}: {
  pathname: string;
  href: (typeof navItems)[number]["href"];
  label: string;
  className?: string;
}) {
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={twMerge(
        "relative flex items-center px-3 py-2.5 text-sm font-medium transition-colors outline-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active ? "text-fg" : "text-muted-fg hover:text-fg",
        className,
      )}
    >
      {label}
      {active && (
        <motion.span
          layoutId="desktop-nav-active"
          className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-primary"
          transition={{ type: "spring", stiffness: 500, damping: 40 }}
        />
      )}
    </Link>
  );
}

function DrawerNavLink({
  pathname,
  href,
  label,
}: {
  pathname: string;
  href: (typeof navItems)[number]["href"];
  label: string;
}) {
  const { setOpen } = useNavbar();
  const active = isActivePath(pathname, href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={() => setOpen(false)}
      className={twMerge(
        "rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
        active ? "bg-secondary text-fg" : "text-muted-fg hover:bg-secondary/60 hover:text-fg",
      )}
    >
      {label}
    </Link>
  );
}

/** Search + Ask AI — one unit, visually centered in the header. */
function SearchAskCluster({
  aiOpen,
  onToggleAi,
  shortcutLabel,
  shortcutAria,
  className,
}: {
  aiOpen: boolean;
  onToggleAi: () => void;
  shortcutLabel: string;
  shortcutAria: string;
  className?: string;
}) {
  return (
    <div
      className={twMerge(
        "flex max-w-full min-w-0 shrink-0 flex-nowrap items-center justify-center gap-2 sm:gap-2.5",
        className,
      )}
    >
      <GlobalCommandTrigger className="h-9 min-h-9 min-w-[10.5rem] flex-1 rounded-full px-3 py-2 sm:min-w-[13rem] sm:flex-[5] sm:px-3.5" />
      <span className="shrink-0">
        <AskAiButton
          aiOpen={aiOpen}
          onPress={onToggleAi}
          shortcutLabel={shortcutLabel}
          shortcutAria={shortcutAria}
        />
      </span>
    </div>
  );
}

function AskAiButton({
  aiOpen,
  onPress,
  shortcutLabel,
  shortcutAria,
}: {
  aiOpen: boolean;
  onPress: () => void;
  shortcutLabel: string;
  shortcutAria: string;
}) {
  return (
    <Button
      intent={aiOpen ? "primary" : "outline"}
      size="sm"
      onPress={onPress}
      aria-pressed={aiOpen}
      aria-label={`${aiOpen ? "Close" : "Open"} AI guide`}
      aria-keyshortcuts={shortcutAria}
      className="h-9 shrink-0 rounded-full px-3"
    >
      <SparklesIcon />
      <span className="hidden sm:inline">Ask AI</span>
      <kbd
        aria-hidden
        className={twMerge(
          "hidden h-5 items-center rounded px-1 py-1 text-[12px] font-medium tracking-wider sm:inline-flex",
          aiOpen
            ? "bg-primary-fg/15 text-primary-fg/80"
            : "bg-muted-fg/10 text-muted-fg",
        )}
      >
        {shortcutLabel}
      </kbd>
    </Button>
  );
}

function FloatingAiBubble({
  aiOpen,
  onPress,
  shortcutAria,
}: {
  aiOpen: boolean;
  onPress: () => void;
  shortcutAria: string;
}) {
  return (
    <div className="lg:hidden">
      <Tooltip>
        <Button
          intent={aiOpen ? "primary" : "outline"}
          size="sq-lg"
          isCircle
          aria-label={aiOpen ? "Close AI guide" : "Open AI guide"}
          aria-keyshortcuts={shortcutAria}
          className="fixed bottom-4 end-4 z-40 shadow-lg sm:bottom-5 sm:end-5"
          onPress={onPress}
        >
          <SparklesIcon className="size-6 sm:size-5" />
        </Button>
        <TooltipContent placement="top">{aiOpen ? "Close AI guide" : "Ask AI"}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function DesktopHeaderBar({
  locale,
  pathname,
  aiOpen,
  onToggleAi,
  shortcutLabel,
  shortcutAria,
}: {
  locale: string;
  pathname: string;
  aiOpen: boolean;
  onToggleAi: () => void;
  shortcutLabel: string;
  shortcutAria: string;
}) {
  return (
    <header className="sticky top-0 z-40 hidden border-border border-b bg-bg/95 backdrop-blur supports-backdrop-filter:bg-bg/95 lg:block">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center px-4 lg:px-6">
        {/* Left: logo + nav */}
        <div className="flex flex-1 items-center gap-5">
          <StartupUtahLogoLink className="shrink-0" />
          <LayoutGroup id="desktop-nav">
            <nav className="flex items-center gap-1" aria-label="Primary">
              {navItems.map((item) => (
                <HeaderNavLink key={item.href} pathname={pathname} href={item.href} label={item.label} />
              ))}
            </nav>
          </LayoutGroup>
        </div>

        {/* Center: search + ask AI */}
        <div className="flex flex-1 items-center justify-center px-4">
          <SearchAskCluster
            aiOpen={aiOpen}
            onToggleAi={onToggleAi}
            shortcutLabel={shortcutLabel}
            shortcutAria={shortcutAria}
            className="w-full max-w-sm xl:max-w-md"
          />
        </div>

        {/* Right: locale + theme */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <LocaleSwitcher locale={locale} className="w-[6.75rem]" triggerClassName="px-2" />
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  );
}

function HeaderBar({
  locale,
  pathname,
  aiOpen,
  onToggleAi,
  shortcutLabel,
  shortcutAria,
}: {
  locale: string;
  pathname: string;
  aiOpen: boolean;
  onToggleAi: () => void;
  shortcutLabel: string;
  shortcutAria: string;
}) {
  return (
    <NavbarProvider mobileMediaQuery={HEADER_COMPACT_MEDIA_QUERY}>
      <DesktopHeaderBar
        locale={locale}
        pathname={pathname}
        aiOpen={aiOpen}
        onToggleAi={onToggleAi}
        shortcutLabel={shortcutLabel}
        shortcutAria={shortcutAria}
      />

      <Navbar suppressDesktopChrome isSticky side="left" intent="default">
        <div className="px-2 py-4">
          <StartupUtahLogoLink />
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-0.5 px-2 py-1">
          {navItems.map((item) => (
            <DrawerNavLink key={item.href} pathname={pathname} href={item.href} label={item.label} />
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 border-t border-border px-2 py-4">
          <LocaleSwitcher locale={locale} className="min-w-0 flex-1" triggerClassName="px-2" />
          <ThemeSwitcher />
        </div>
      </Navbar>

      <NavbarMobile className="border-border border-b bg-bg/95 backdrop-blur-md supports-backdrop-filter:bg-bg/95 lg:hidden">
        <StartupUtahLogoLink className="min-w-0 shrink-0 overflow-hidden" />
        <div className="flex min-h-9 min-w-0 flex-1 items-center justify-center px-1">
          <SearchAskCluster
            aiOpen={aiOpen}
            onToggleAi={onToggleAi}
            shortcutLabel={shortcutLabel}
            shortcutAria={shortcutAria}
            className="w-auto max-w-[calc(100vw-8.5rem)]"
          />
        </div>
        <NavbarTrigger aria-label="Open menu" />
      </NavbarMobile>
    </NavbarProvider>
  );
}

function AiGuideSidebar() {
  return (
    <Sidebar side="right" collapsible="hidden" className="top-[calc(4rem+1px)] bg-bg text-fg">
      <SidebarContent className="overflow-hidden p-0">
        <AiGuideSidebarBody />
      </SidebarContent>
    </Sidebar>
  );
}

function AiGuideSidebarBody() {
  const { toggleSidebar } = useSidebar();
  return <GuideChatPanel compact onCollapse={toggleSidebar} />;
}

export function PublicSiteShell({ children, locale }: Props) {
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);

  const shortcutLabel = isMacEnv ? "⌘L" : "Ctrl L";
  const shortcutAria = isMacEnv ? "Meta+L" : "Control+L";
  const isAdminRoute = pathname.startsWith("/admin");
  const toggleAiOpen = useCallback(() => setAiOpen((open) => !open), []);

  useGlobalMetaCtrlKeyToggle({
    enabled: !isAdminRoute,
    key: "l",
    onToggle: toggleAiOpen,
  });

  if (isAdminRoute) {
    return <>{children}</>;
  }

  const showAi = aiOpen;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      {/* Sticky wrapper. The inner <header> can't stick on its own because
          its NavbarProvider parent (a flex-col with no fixed height) collapses
          to the header's own height, leaving sticky no room to operate. This
          wrapper is a flex item of the full-page column, which has the height
          sticky needs. */}
      <div className="sticky top-0 z-40">
        <HeaderBar
          locale={locale}
          pathname={pathname}
          aiOpen={showAi}
          onToggleAi={toggleAiOpen}
          shortcutLabel={shortcutLabel}
          shortcutAria={shortcutAria}
        />
      </div>
      <SidebarProvider
        isOpen={showAi}
        onOpenChange={setAiOpen}
        mobileMediaQuery={AI_PANEL_MOBILE_MEDIA}
        className="flex-1"
        style={{ "--sidebar-width": "26rem" } as React.CSSProperties}
      >
        <SidebarInset>
          <main className="min-h-[calc(100dvh-4rem)]">
            {children}
          </main>
        </SidebarInset>
        <AiGuideSidebar />
      </SidebarProvider>
      <FloatingAiBubble
        aiOpen={showAi}
        onPress={toggleAiOpen}
        shortcutAria={shortcutAria}
      />
    </div>
  );
}
