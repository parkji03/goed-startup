const SLUG_RE = /\/resources\/([a-z0-9][a-z0-9-]*)/gi;

/** Extract every distinct `/resources/<slug>` reference from a chunk of model text. */
export function extractSlugs(text: string): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(SLUG_RE)) {
    const slug = match[1].toLowerCase();
    if (!seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

/**
 * Logs slugs the model emitted that are not in the retrieved context.
 * Server-side only. v1 logs; post-hackathon enforces.
 */
export function logHallucinatedSlugs(args: {
  modelText: string;
  contextSlugs: string[];
  hashedIp: string;
}): string[] {
  const emitted = extractSlugs(args.modelText);
  const allowed = new Set(args.contextSlugs.map((s) => s.toLowerCase()));
  const bad = emitted.filter((s) => !allowed.has(s));
  if (bad.length > 0) {
    console.warn('[guide] hallucinated slugs', { ip: args.hashedIp, slugs: bad });
  }
  return bad;
}
