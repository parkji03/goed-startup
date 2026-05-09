"use client";

import { SparklesIcon, XMarkIcon } from "@heroicons/react/20/solid";
import type { ReactNode } from "react";
import { useCallback, useState, useSyncExternalStore } from "react";
import { twMerge } from "tailwind-merge";
import { useGlobalMetaCtrlKeyToggle } from "@/hooks/use-global-keyboard-toggle";
import { GuideChatPanel } from "@/components/guide/guide-chat-panel";
import { GlobalCommandTrigger } from "@/components/global-command-trigger";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { StartupUtahLogoLink } from "@/components/startup-utah-logo-link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { ModalBody, ModalContent, ModalHeader, ModalTitle } from "@/components/ui/modal";
import {
  Navbar,
  NavbarMobile,
  NavbarProvider,
  NavbarSection,
  NavbarTrigger,
} from "@/components/ui/navbar";
import { Text } from "@/components/ui/text";
import { Link, usePathname } from "@/i18n/navigation";

type Props = {
  children: ReactNode;
  locale: string;
};

const navItems = [
  { href: "/" as const, label: "Resources" },
  { href: "/guide" as const, label: "Guide" },
  { href: "/quiz" as const, label: "Quiz" },
  { href: "/map" as const, label: "Map" },
  { href: "/resources/submit" as const, label: "Submit" },
];

/**
 * Viewports narrower than this use the compact header (top rail + sheet + FAB).
 * Matches Tailwind `lg` so the layout lines up with `lg:` utilities.
 */
const HEADER_COMPACT_MAX_PX = 1023;
const HEADER_COMPACT_MEDIA_QUERY = `(max-width: ${HEADER_COMPACT_MAX_PX}px)`;

/** Docked AI panel — align with Tailwind `xl` (1280px). */
const XL_MEDIA_QUERY = "(min-width: 1280px)";

function subscribeXl(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(XL_MEDIA_QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
const getXlSnapshot = () =>
  typeof window !== "undefined" && window.matchMedia(XL_MEDIA_QUERY).matches;
const getXlServerSnapshot = () => false;

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
        "rounded-md px-2.5 py-1.5 text-sm font-medium transition outline-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active ? "bg-secondary text-fg" : "text-muted-fg hover:bg-secondary/60 hover:text-fg",
        className,
      )}
    >
      {label}
    </Link>
  );
}

/** Search + Ask AI — one unit, visually centered in the header via the parent overlay row. */
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
          "hidden rounded border px-1 font-mono text-[10px] sm:inline",
          aiOpen ? "border-primary-fg/30 text-primary-fg/80" : "border-border text-muted-fg",
        )}
      >
        {shortcutLabel}
      </kbd>
    </Button>
  );
}

function FloatingAiBubble({
  visible,
  aiOpen,
  onPress,
  shortcutAria,
}: {
  visible: boolean;
  aiOpen: boolean;
  onPress: () => void;
  shortcutAria: string;
}) {
  if (!visible) return null;

  return (
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
      <div className="relative mx-auto flex min-h-16 max-w-screen-2xl items-center px-4">
        <div className="relative z-10 flex min-w-0 max-w-[min(42%,100%-12rem)] flex-1 items-center gap-3">
          <StartupUtahLogoLink className="min-w-0 shrink-0 overflow-hidden" />
          <nav className="flex min-w-0 flex-wrap items-center gap-0.5" aria-label="Primary">
            {navItems.map((item) => (
              <HeaderNavLink key={item.href} pathname={pathname} href={item.href} label={item.label} />
            ))}
          </nav>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-center px-2">
          <div className="pointer-events-auto w-full max-w-[min(calc(100vw-2rem),36rem)] sm:max-w-xl lg:max-w-2xl">
            <SearchAskCluster
              aiOpen={aiOpen}
              onToggleAi={onToggleAi}
              shortcutLabel={shortcutLabel}
              shortcutAria={shortcutAria}
              className="w-full"
            />
          </div>
        </div>

        <div className="relative z-10 ms-auto flex w-[min(42%,100%-12rem)] shrink-0 items-center justify-end gap-2">
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

      <Navbar suppressDesktopChrome isSticky side="right" intent="default">
        <div className="border-border border-b pb-4">
          <Heading level={2} className="font-semibold text-fg text-lg">
            Startup Utah
          </Heading>
          <Text className="text-pretty text-muted-fg text-sm">
            Find resources, ask the guide, and explore the ecosystem.
          </Text>
        </div>

        <NavbarSection aria-label="Primary" className="mt-2">
          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => (
              <HeaderNavLink
                key={item.href}
                pathname={pathname}
                href={item.href}
                label={item.label}
                className="block px-1 py-2.5 text-base"
              />
            ))}
          </nav>
        </NavbarSection>

        <NavbarSection className="mt-8 border-border border-t pt-6">
          <div className="space-y-2">
            <Text className="font-medium text-muted-fg text-xs uppercase tracking-wide">Language</Text>
            <LocaleSwitcher locale={locale} className="w-full" triggerClassName="px-3" />
          </div>
          <div className="mt-6 space-y-2">
            <Text className="font-medium text-muted-fg text-xs uppercase tracking-wide">Theme</Text>
            <ThemeSwitcher />
          </div>
        </NavbarSection>
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

function DesktopAiPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <aside className="fixed end-0 bottom-0 top-16 z-30 hidden w-96 border-border border-s bg-bg xl:flex">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center justify-between border-border border-b px-4 py-3">
          <Heading level={3} className="font-semibold text-muted-fg text-sm uppercase tracking-wide">
            AI Guide
          </Heading>
          <Button intent="plain" size="sq-xs" onPress={onClose} aria-label="Close AI guide panel">
            <XMarkIcon />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <GuideChatPanel compact />
        </div>
      </div>
    </aside>
  );
}

function AiChatModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <ModalContent
      isOpen={open}
      onOpenChange={onOpenChange}
      size="fullscreen"
      aria-label="AI guide"
    >
      <ModalHeader>
        <ModalTitle>AI Guide</ModalTitle>
      </ModalHeader>
      <ModalBody className="pb-6">
        <GuideChatPanel compact />
      </ModalBody>
    </ModalContent>
  );
}

export function PublicSiteShell({ children, locale }: Props) {
  const pathname = usePathname();
  const [aiOpen, setAiOpen] = useState(false);
  const isXl = useSyncExternalStore(subscribeXl, getXlSnapshot, getXlServerSnapshot);
  const isCompactHeader = useSyncExternalStore(
    useCallback((onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(HEADER_COMPACT_MEDIA_QUERY);
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    }, []),
    () =>
      typeof window !== "undefined" && window.matchMedia(HEADER_COMPACT_MEDIA_QUERY).matches,
    () => false,
  );

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

  const showAi = aiOpen && !pathname.startsWith("/guide");
  const showSidePanel = showAi && isXl;
  const showModal = showAi && !isXl;

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <HeaderBar
        locale={locale}
        pathname={pathname}
        aiOpen={showAi}
        onToggleAi={toggleAiOpen}
        shortcutLabel={shortcutLabel}
        shortcutAria={shortcutAria}
      />
      <DesktopAiPanel open={showSidePanel} onClose={() => setAiOpen(false)} />
      <AiChatModal open={showModal} onOpenChange={setAiOpen} />

      <FloatingAiBubble
        visible={isCompactHeader}
        aiOpen={showAi}
        onPress={toggleAiOpen}
        shortcutAria={shortcutAria}
      />

      <main
        className={twMerge(
          "min-h-[calc(100dvh-3.5rem)] sm:min-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-4rem)]",
          showSidePanel && "xl:pe-96",
          isCompactHeader && "pb-20",
        )}
      >
        {children}
      </main>
    </div>
  );
}
