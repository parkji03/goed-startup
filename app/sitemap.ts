import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

const STATIC_PATHS = ["/", "/resources", "/map", "/guide"] as const;

function abs(path: string, locale: string): string {
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  if (path === "/") return `${SITE_URL}${localePath || "/"}`;
  return `${SITE_URL}${localePath}${path}`;
}

function languageAlternates(path: string): Record<string, string> {
  return Object.fromEntries(routing.locales.map((l) => [l, abs(path, l)]));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fail open: if Convex is unreachable at build time we still emit static
  // routes so deploy pipelines don't break. Without NEXT_PUBLIC_CONVEX_URL
  // we skip the dynamic fetch entirely.
  let resourceEntries: Array<{ slug: string; lastModified: number }> = [];
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    try {
      resourceEntries = await fetchQuery(api.resources.sitemapEntries, {});
    } catch {
      resourceEntries = [];
    }
  }

  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: abs(path, locale),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: path === "/" ? 1.0 : 0.7,
      alternates: { languages: languageAlternates(path) },
    })),
  );

  const resourceUrls: MetadataRoute.Sitemap = resourceEntries.flatMap((r) =>
    routing.locales.map((locale) => ({
      url: abs(`/resources/${r.slug}`, locale),
      lastModified: new Date(r.lastModified),
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: { languages: languageAlternates(`/resources/${r.slug}`) },
    })),
  );

  return [...staticEntries, ...resourceUrls];
}
