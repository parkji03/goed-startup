const RESOURCE_SLUG_RE = /\/resources\/([a-z0-9][a-z0-9-]*)/gi;
const GUIDE_SLUG_RE = /\/guides\/([a-z0-9][a-z0-9-]*)/gi;

export type CitationKind = 'resource' | 'guide';

export type ExtractedCitation = { kind: CitationKind; slug: string };

/** Extract every distinct `/resources/<slug>` and `/guides/<slug>` from text. */
export function extractCitations(text: string): ExtractedCitation[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: ExtractedCitation[] = [];
  for (const match of text.matchAll(RESOURCE_SLUG_RE)) {
    const slug = match[1].toLowerCase();
    const key = `resource:${slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: 'resource', slug });
    }
  }
  for (const match of text.matchAll(GUIDE_SLUG_RE)) {
    const slug = match[1].toLowerCase();
    const key = `guide:${slug}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ kind: 'guide', slug });
    }
  }
  return out;
}

/**
 * Logs slugs the model emitted that are not in the retrieved context (per
 * kind). Server-side only. v1 logs; post-hackathon enforces.
 */
export function logHallucinatedSlugs(args: {
  modelText: string;
  contextResourceSlugs: string[];
  contextGuideSlugs: string[];
  hashedIp: string;
}): ExtractedCitation[] {
  const emitted = extractCitations(args.modelText);
  const allowedResource = new Set(args.contextResourceSlugs.map((s) => s.toLowerCase()));
  const allowedGuide = new Set(args.contextGuideSlugs.map((s) => s.toLowerCase()));
  const bad = emitted.filter((c) =>
    c.kind === 'resource' ? !allowedResource.has(c.slug) : !allowedGuide.has(c.slug),
  );
  if (bad.length > 0) {
    console.warn('[guide] hallucinated citations', { ip: args.hashedIp, citations: bad });
  }
  return bad;
}
