import type { NextRequest } from "next/server";
import { routing } from "@/i18n/routing";

const locales = new Set<string>(routing.locales);

export function normalizeHost(host: string | null): string {
  if (!host) return "";
  return host.split(":")[0]!.toLowerCase();
}

export function getConfiguredClerkAdminHost(): string | undefined {
  const h = process.env.CLERK_ADMIN_HOST?.trim();
  return h ? h.toLowerCase() : undefined;
}

/** `/en/admin`, `/es/admin`, `/en/admin/...`, etc. */
export function isLocaleAdminPath(pathname: string): boolean {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return false;
  return locales.has(parts[0]!) && parts[1] === "admin";
}

/**
 * Admin UI + optional future `auth.protect()` — `/[locale]/admin/**` on the
 * configured admin host, or on any host when `CLERK_ADMIN_HOST` is unset (local / Vercel demo).
 */
export function isClerkAdminSurfaceRequest(req: NextRequest): boolean {
  if (!isLocaleAdminPath(req.nextUrl.pathname)) return false;
  const configured = getConfiguredClerkAdminHost();
  if (!configured) return true;
  return normalizeHost(req.headers.get("host")) === configured;
}

/**
 * When `CLERK_ADMIN_HOST` is set, force `/[locale]/admin` to that host (public site redirect).
 */
export function adminCanonicalRedirectUrl(req: NextRequest): URL | null {
  const configured = getConfiguredClerkAdminHost();
  if (!configured) return null;

  const host = normalizeHost(req.headers.get("host"));
  if (host === configured) return null;
  if (!isLocaleAdminPath(req.nextUrl.pathname)) return null;

  const url = new URL(req.url);
  url.hostname = configured;
  return url;
}

/**
 * Whether Clerk UI (`ClerkProvider`, buttons) may render for this server request.
 */
export async function clerkUiAllowedFromHeaders(
  getHeader: (name: string) => string | null,
): Promise<boolean> {
  const configured = getConfiguredClerkAdminHost();
  if (!configured) return true;

  const forwarded = getHeader("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const host = normalizeHost(forwarded || getHeader("host"));
  return host === configured;
}
