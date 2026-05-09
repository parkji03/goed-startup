import { clerkMiddleware } from "@clerk/nextjs/server";
import createMiddleware from "next-intl/middleware";
import {
  adminCanonicalRedirectUrl,
  isClerkAdminSurfaceRequest,
} from "@/lib/clerk-admin-scope";
import { routing } from "@/i18n/routing";
import { NextResponse } from "next/server";

const intlMiddleware = createMiddleware(routing);

/**
 * Public-first: only the GOED admin surface (locale-prefixed `/admin`, plus
 * `CLERK_ADMIN_HOST` when set) requires a signed-in Clerk session.
 */
export default clerkMiddleware(async (auth, req) => {
  const canonical = adminCanonicalRedirectUrl(req);
  if (canonical) {
    return NextResponse.redirect(canonical);
  }

  if (isClerkAdminSurfaceRequest(req)) {
    await auth.protect();
  }

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  return intlMiddleware(req);
});

export const config = {
  matcher: [
    // Excludes static assets *and* SEO files (sitemap.xml, robots.txt) so
    // crawlers see them at their canonical, locale-free path.
    "/((?!_next|sitemap\\.xml|robots\\.txt|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|xml|txt)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
