/**
 * P2.3 — Patch markdown bodies onto resources by sourceId.
 *
 * Input:  data/resource-bodies.json (curated by P2.2's build script)
 * Action: calls internal.resourceInternal:patchBody for each entry,
 *         which updates the body field and recomputes searchText.
 *
 * Idempotent — re-runnable after edits to resource-bodies.json. Skips entries
 * whose sourceId doesn't resolve to an existing row (logs a warning).
 *
 * Usage (from repo root):
 *   pnpm enrich:resource-bodies
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSeedTarget } from './lib/seed-target';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(scriptDir, '..');
const INPUT = resolve(REPO_ROOT, 'data', 'resource-bodies.json');

type BodyEntry = {
  sourceId: string;
  sourceMdPath: string;
  body: string;
};

function main() {
  // CLI-only script: Convex CLI handles deployment resolution
  // (CONVEX_DEPLOYMENT / .convex/ / --prod). NEXT_PUBLIC_CONVEX_URL is for
  // ConvexHttpClient and is not required here.
  const { target, convexRunFlags } = resolveSeedTarget();

  const entries: BodyEntry[] = JSON.parse(readFileSync(INPUT, 'utf-8'));
  console.log(
    `[target=${target}] Patching ${entries.length} resource bodies via internal.resourceInternal:patchBody…\n`,
  );

  let patched = 0;
  let missing = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!entry.sourceId || !entry.body) {
      console.warn(`  skip: malformed entry ${JSON.stringify(entry).slice(0, 120)}`);
      failed++;
      continue;
    }
    const payload = JSON.stringify({ sourceId: entry.sourceId, body: entry.body });
    try {
      const out = execFileSync(
        'pnpm',
        ['exec', 'convex', 'run', ...convexRunFlags, 'resourceInternal:patchBody', payload],
        {
          cwd: REPO_ROOT,
          stdio: ['ignore', 'pipe', 'inherit'],
          env: process.env,
          encoding: 'utf-8',
        },
      );
      // `convex run` writes a multi-line pretty-printed JSON result to stdout.
      // Parse the whole buffer; the mutation returns a single object.
      const result = JSON.parse(out.trim());
      if (result.patched) {
        patched++;
        console.log(`  ok      ${entry.sourceId} (${result.bodyChars} chars)`);
      } else {
        missing++;
        console.log(`  missing ${entry.sourceId} — no row with this sourceId`);
      }
    } catch (err) {
      failed++;
      console.error(`  fail    ${entry.sourceId} — ${(err as Error).message.split('\n')[0]}`);
    }
  }

  console.log('\n────────── enrichment summary ──────────');
  console.log(`  patched: ${patched}`);
  console.log(`  missing: ${missing}`);
  console.log(`  failed:  ${failed}`);
}

main();
