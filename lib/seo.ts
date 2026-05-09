/**
 * Canonical site origin used to build absolute URLs for OG tags, sitemap,
 * robots, and structured data. Set NEXT_PUBLIC_SITE_URL in production.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://startup.utah.gov";

export const SITE_NAME = "Startup Utah";

/** Strip markdown/whitespace and clamp to a meta-friendly length. */
export function truncateForMeta(input: string, max = 160): string {
  const flat = input.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  // Cut on word boundary to avoid awkward mid-word truncation.
  const slice = flat.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 60 ? lastSpace : slice.length).trimEnd()}…`;
}

export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
