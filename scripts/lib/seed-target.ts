/**
 * Shared seed-target resolver.
 *
 * Two env knobs control where seed scripts write:
 *
 *   CONVEX_TARGET        "dev" (default) or "prod". Controls whether
 *                        `convex run` is invoked with `--prod`, and is the
 *                        signal callers use to decide which deployment URL
 *                        to give to ConvexHttpClient.
 *
 *   SEED_CONFIRM_PROD    Required (set to "1") whenever CONVEX_TARGET=prod.
 *                        Prevents accidental prod writes when an env file
 *                        is loaded with a stray prod URL or someone runs
 *                        `seed:all:prod` without realizing what it does.
 *
 * Every script in the seed pipeline calls `resolveSeedTarget()` at startup.
 * It throws fast (before any network call) if the env is inconsistent.
 */

export type SeedTarget = 'dev' | 'prod';

export type ResolvedSeedTarget = {
  target: SeedTarget;
  /** Flags to pass to `pnpm exec convex run …` (empty for dev, ["--prod"] for prod). */
  convexRunFlags: string[];
};

export function resolveSeedTarget(): ResolvedSeedTarget {
  const raw = (process.env.CONVEX_TARGET ?? 'dev').toLowerCase();
  if (raw !== 'dev' && raw !== 'prod') {
    throw new Error(
      `Unknown CONVEX_TARGET=${raw}. Use "dev" (default) or "prod".`,
    );
  }
  const target = raw as SeedTarget;
  if (target === 'prod' && process.env.SEED_CONFIRM_PROD !== '1') {
    throw new Error(
      [
        'CONVEX_TARGET=prod requires SEED_CONFIRM_PROD=1.',
        'This will write to the PRODUCTION Convex deployment.',
        '',
        '  Set both env vars to proceed:',
        '    CONVEX_TARGET=prod SEED_CONFIRM_PROD=1 pnpm seed:all:prod',
        '',
        'Or, if you genuinely meant dev, unset CONVEX_TARGET (or set it to "dev").',
      ].join('\n'),
    );
  }
  return {
    target,
    convexRunFlags: target === 'prod' ? ['--prod'] : [],
  };
}

/**
 * Resolve the Convex HTTP URL for ConvexHttpClient-based seeders
 * (seed-companies, seed-investors). Prod expects NEXT_PUBLIC_CONVEX_PROD_URL
 * so dev and prod URLs don't collide in a single .env file.
 */
export function resolveConvexHttpUrl(target: SeedTarget): string {
  if (target === 'prod') {
    const url = process.env.NEXT_PUBLIC_CONVEX_PROD_URL;
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_PROD_URL is not set. Add it to .env.local (or your env) and re-run.',
      );
    }
    return url;
  }
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_CONVEX_URL is not set. Populate .env.local (see .env.example) and link Convex.',
    );
  }
  return url;
}
