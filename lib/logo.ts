/**
 * logo.dev image URL helpers.
 *
 * The publishable token (`pk_...`) is meant to ride along in the image URL —
 * it's served to the browser, not used server-side. Read it from the public
 * env var so client components can build URLs at render time.
 */

const TOKEN = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

// Domains where logo.dev confidently returns the wrong logo. Returning
// `null` from `logoDevUrl` for these forces every caller down its no-logo
// branch, which renders the initial-avatar fallback — better than a
// confidently-wrong image. Add a comment with the symptom + date when
// extending this set so it's auditable.
const LOGO_DEV_BLOCKLIST = new Set<string>([
  // Returns the Lyft logo as of May 2026.
  'ugrowthfund.com',
]);

/**
 * Reduce a website value to a bare hostname suitable for logo.dev:
 *   "https://www.acme.com/about" → "acme.com"
 *   "acme.com"                    → "acme.com"
 *   ""/"not a url"                → null
 */
export function domainFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withScheme);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Build a logo.dev image URL for a domain. Returns null if no domain or no
 * token is configured — callers should treat null as "no logo, fall back".
 */
export function logoDevUrl(
  domain: string | null | undefined,
  opts: { size?: number; format?: 'webp' | 'png' } = {},
): string | null {
  if (!domain || !TOKEN) return null;
  if (LOGO_DEV_BLOCKLIST.has(domain)) return null;
  const size = opts.size ?? 128;
  const format = opts.format ?? 'webp';
  const params = new URLSearchParams({
    token: TOKEN,
    size: String(size),
    format,
  });
  return `https://img.logo.dev/${domain}?${params.toString()}`;
}
