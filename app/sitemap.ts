import type { MetadataRoute } from "next";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { routing } from "@/i18n/routing";
import { SITE_URL } from "@/lib/seo";

const STATIC_PATHS = [
  "/",
  "/resources",
  "/guides",
  "/guides/journey",
  "/news",
  "/map",
  "/guide",
] as const;

type SlugEntry = { slug: string; lastModified: number };

function abs(path: string, locale: string): string {
  const localePath = locale === routing.defaultLocale ? "" : `/${locale}`;
  if (path === "/") return `${SITE_URL}${localePath || "/"}`;
  return `${SITE_URL}${localePath}${path}`;
}

function languageAlternates(path: string): Record<string, string> {
  return Object.fromEntries(routing.locales.map((l) => [l, abs(path, l)]));
}

async function safeEntries<Q extends Parameters<typeof fetchQuery>[0]>(
  q: Q,
): Promise<SlugEntry[]> {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return [];
  try {
    return (await fetchQuery(q, {})) as SlugEntry[];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fan out the Convex reads in parallel; fail open if either is unreachable
  // so deploy pipelines never break on a missing dev deployment.
  const [resourceEntries, guideEntries] = await Promise.all([
    safeEntries(api.resources.sitemapEntries),
    safeEntries(api.guides.sitemapEntries),
  ]);

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

  const guideUrls: MetadataRoute.Sitemap = guideEntries.flatMap((g) =>
    routing.locales.map((locale) => ({
      url: abs(`/guides/${g.slug}`, locale),
      lastModified: new Date(g.lastModified),
      changeFrequency: "monthly" as const,
      priority: 0.6,
      alternates: { languages: languageAlternates(`/guides/${g.slug}`) },
    })),
  );

  return [...staticEntries, ...resourceUrls, ...guideUrls];
}
