"use client";

import { Show, UserButton } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ChevronDownIcon, SparklesIcon } from "@heroicons/react/20/solid";
import { LayoutGroup, motion } from "motion/react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { twMerge } from "tailwind-merge";
import { useGlobalMetaCtrlKeyToggle } from "@/hooks/use-global-keyboard-toggle";
import { GuideChatPanel } from "@/components/guide/guide-chat-panel";
import { GlobalCommandTrigger } from "@/components/global-command-trigger";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { MapQuizProvider } from "@/components/map/map-quiz-provider";
import { QuizProvider } from "@/components/quiz/quiz-provider";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button, buttonStyles } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";

type Props = {
  children: ReactNode;
  locale: string;
};

const navItems = [
  { href: "/" as const, label: "Resources" },
  { href: "/guides" as const, label: "Guides" },
  { href: "/news" as const, label: "News" },
];

const mapMenuItems = [
  { href: "/map" as const, label: "Utah Companies" },
  // Investors corpus is global; preselect the layer via `?type=investor`.
  // FloatingFilterBar reads/writes the same param, so the toggle stays in sync.
  { href: "/map?type=investor" as const, label: "Global Investors" },
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
  if (href === "/guides") return pathname === "/guides" || pathname.startsWith("/guides/");
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

/** Desktop nav dropdown for the two map variants. Mirrors HeaderNavLink's
 *  visual treatment (active text + animated underline) so it sits in the
 *  layout group seamlessly. */
function MapNavMenu({ pathname }: { pathname: string }) {
  const active = isActivePath(pathname, "/map");
  return (
    <Menu>
      <MenuTrigger
        aria-current={active ? "page" : undefined}
        className={twMerge(
          "relative flex items-center gap-1 px-3 py-2.5 text-sm font-medium transition-colors outline-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active ? "text-fg" : "text-muted-fg hover:text-fg",
        )}
      >
        Map
        <ChevronDownIcon aria-hidden className="size-3.5" />
        {active && (
          <motion.span
            layoutId="desktop-nav-active"
            className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-primary"
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
      </MenuTrigger>
      <MenuContent placement="bottom start">
        {mapMenuItems.map((item) => (
          <MenuItem key={item.href} href={item.href}>
            {item.label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/** Mobile drawer counterpart: a labeled section with two indented links. The
 *  drawer is a flat vertical stack, so a popover would feel out of place. */
function DrawerMapMenu({ pathname }: { pathname: string }) {
  const { setOpen } = useNavbar();
  const active = isActivePath(pathname, "/map");
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={twMerge(
          "px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide",
          active ? "text-fg" : "text-muted-fg",
        )}
      >
        Map
      </div>
      {mapMenuItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setOpen(false)}
          className="rounded-lg px-6 py-2.5 text-base font-medium text-muted-fg transition-colors hover:bg-secondary/60 hover:text-fg"
        >
          {item.label}
        </Link>
      ))}
    </div>
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
              <MapNavMenu pathname={pathname} />
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

        {/* Right: locale + theme + auth */}
        <div className="flex flex-1 items-center justify-end gap-2">
          <LocaleSwitcher locale={locale} className="w-[6.75rem]" triggerClassName="px-2" />
          <ThemeSwitcher />
          <HeaderAuthSlot />
        </div>
      </div>
    </header>
  );
}

/**
 * Auth UI in the header. Self-contained so it can render in both the desktop
 * top rail and the mobile drawer without each call site needing to know
 * which Clerk components to compose. Renders nothing when Clerk isn't
 * configured — `<Show>` is a no-op outside a `ClerkProvider`, which is
 * itself conditional on the publishable key being set.
 *
 * Clerk v7 collapsed the old `<SignedIn>` / `<SignedOut>` pair into a
 * single `<Show when="…">` API, so we use that here.
 */
function HeaderAuthSlot() {
  // Subscribes to the role even for signed-out users — the query short-
  // circuits to `kind: 'anonymous'` when there's no identity, so it's a
  // single cheap subscription that drives every auth-aware piece of
  // chrome (admin pill, future claimer links, etc.).
  const role = useQuery(api.me.getRole);
  return (
    <>
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="rounded-md px-3 py-1.5 text-sm font-medium text-fg/80 transition-colors hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        {/* Every signed-in user gets a path to their claimer dashboard.
            If they have no claims it lands on an empty-state with a
            "Claim a business" CTA, which is itself the right next step. */}
        <Link
          href="/dashboard"
          className={twMerge(
            buttonStyles({ intent: "outline", size: "xs" }),
            "shrink-0 whitespace-nowrap",
          )}
        >
          My businesses
        </Link>
        {role?.kind === "admin" && (
          <Link
            href="/admin"
            className={twMerge(
              buttonStyles({ intent: "outline", size: "xs" }),
              "shrink-0 whitespace-nowrap",
            )}
          >
            Admin
          </Link>
        )}
        <UserButton />
      </Show>
    </>
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
          <DrawerMapMenu pathname={pathname} />
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-2 border-t border-border px-2 py-4">
          <LocaleSwitcher locale={locale} className="min-w-0 flex-1" triggerClassName="px-2" />
          <ThemeSwitcher />
          <HeaderAuthSlot />
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

/**
 * Side-effect-only gate that:
 *
 *   1. Touches the `users` directory once the role resolves so the admin
 *      UI has a `tokenIdentifier → email` mapping for any signed-in user.
 *   2. Redirects revoked users to `/access-revoked` from anywhere in the
 *      app. Sits at the top of the shell so the redirect fires regardless
 *      of which chrome branch (`usesOwnChrome` vs. public) renders below.
 *
 * Renders nothing. Hooks run unconditionally so React's hook-order rule
 * is preserved across role transitions.
 */
function PortalAccessGate({ pathname }: { pathname: string }) {
  const role = useQuery(api.me.getRole);
  const touch = useMutation(api.me.touch);
  const router = useRouter();

  // Populate the users directory once we have a signed-in role. Convex
  // mutations are idempotent on the server (`me.touch` patches only on
  // drift), so calling once per role transition is plenty.
  useEffect(() => {
    if (role?.kind === "authenticated" || role?.kind === "admin") {
      void touch({});
    }
  }, [role?.kind, touch]);

  // Revocation redirect. Skip when already on the destination so the
  // page itself stays reachable.
  useEffect(() => {
    if (!role?.revoked) return;
    if (pathname.startsWith("/access-revoked")) return;
    router.replace("/access-revoked");
  }, [role?.revoked, pathname, router]);

  return null;
}

export function PublicSiteShell({ children, locale }: Props) {
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);

  const shortcutLabel = isMacEnv ? "⌘I" : "Ctrl I";
  const shortcutAria = isMacEnv ? "Meta+I" : "Control+I";
  const isAdminRoute = pathname.startsWith("/admin");
  const isDashboardRoute = pathname.startsWith("/dashboard");
  // Both admin and the owner dashboard render their own minimal chrome —
  // skip the public site header (and its AI sidebar) on those surfaces.
  const usesOwnChrome = isAdminRoute || isDashboardRoute;
  const toggleAiOpen = useCallback(() => setAiOpen((open) => !open), []);

  useGlobalMetaCtrlKeyToggle({
    enabled: !usesOwnChrome,
    key: "i",
    onToggle: toggleAiOpen,
  });

  if (usesOwnChrome) {
    return (
      <>
        <PortalAccessGate pathname={pathname} />
        {children}
      </>
    );
  }

  const showAi = aiOpen;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <PortalAccessGate pathname={pathname} />
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
        <QuizProvider>
          <MapQuizProvider>
            <SidebarInset>
              <main className="min-h-[calc(100dvh-4rem)]">
                {children}
              </main>
            </SidebarInset>
            <AiGuideSidebar />
          </MapQuizProvider>
        </QuizProvider>
      </SidebarProvider>
      <FloatingAiBubble
        aiOpen={showAi}
        onPress={toggleAiOpen}
        shortcutAria={shortcutAria}
      />
    </div>
  );
}
