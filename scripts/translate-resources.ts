/**
 * Translate `title` + `description` of every Builder Day CSV resource into
 * Spanish via DeepL, then persist on the matching Convex row via
 * `resourceMigration:setTranslationBySourceId`. Idempotent: a local cache
 * (`data/resources-translations-es.json`) memoizes DeepL output keyed by
 * sourceId, so re-running only translates new/changed rows.
 *
 * Usage (from repo root, with Convex linked):
 *   DEEPL_API_KEY=... pnpm exec tsx scripts/translate-resources.ts
 *
 * Override input CSV with the first CLI arg.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const CSV_PATH_DEFAULT = path.resolve(repoRoot, 'data', 'resources-builder-day.csv');
const CACHE_PATH = path.resolve(repoRoot, 'data', 'resources-translations-es.json');

const DEEPL_URL = 'https://api-free.deepl.com/v2/translate';
const BATCH = 25;

const apiKey = process.env.DEEPL_API_KEY;
if (!apiKey) throw new Error('DEEPL_API_KEY is not set.');

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL is not set. Populate .env.local (see .env.example) and link Convex.',
  );
}

type CsvRow = {
  id: string;
  Title: string;
  description: string;
};

type TranslationCache = Record<string, { title: string; description: string }>;

/** Wrap ICU placeholders in <x>..</x> and XML-escape `&`/`<`/`>`. The
 *  resource CSV doesn't have ICU placeholders, but the helper protects
 *  ampersands the same way the messages translator does. */
function xmlEscapeForDeepL(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function xmlUnescape(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function deeplBatch(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const payload = {
    text: texts.map(xmlEscapeForDeepL),
    target_lang: 'ES',
    tag_handling: 'xml',
    ignore_tags: ['x'],
    preserve_formatting: true,
  };
  const resp = await fetch(DEEPL_URL, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`DeepL ${resp.status}: ${body}`);
  }
  const data = (await resp.json()) as { translations: { text: string }[] };
  return data.translations.map((t) => xmlUnescape(t.text));
}

function loadCache(): TranslationCache {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
}

function saveCache(cache: TranslationCache): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const csvPath =
    typeof process.argv[2] === 'string' ? path.resolve(process.cwd(), process.argv[2]) : CSV_PATH_DEFAULT;

  const csvText = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data
    .filter((r) => r.id && r.Title?.trim() && r.description?.trim())
    .map((r) => ({
      sourceId: String(r.id),
      title: String(r.Title).trim(),
      description: String(r.description).trim(),
    }));

  const cache = loadCache();
  const stale = rows.filter((r) => {
    const cached = cache[r.sourceId];
    if (!cached) return true;
    // Re-translate if the source text changed since the last run.
    return cached.title === r.title && cached.description === r.description ? false : true;
  });

  console.log(`CSV: ${rows.length} rows · cache hits: ${rows.length - stale.length} · need translation: ${stale.length}`);

  if (stale.length > 0) {
    // DeepL accepts up to 50 texts per call; batch by row pairs (title+desc).
    for (const batch of chunk(stale, BATCH)) {
      const inputs = batch.flatMap((r) => [r.title, r.description]);
      const out = await deeplBatch(inputs);
      for (let i = 0; i < batch.length; i++) {
        const r = batch[i]!;
        const title = out[i * 2] ?? '';
        const description = out[i * 2 + 1] ?? '';
        cache[r.sourceId] = { title, description };
      }
      saveCache(cache);
      const first = batch[0]!.title;
      console.log(`  translated ${batch.length} rows (first: ${first.slice(0, 60)}…)`);
    }
  }

  console.log('\nPushing translations to Convex …');
  let pushed = 0;
  let failed = 0;
  for (const r of rows) {
    const t = cache[r.sourceId];
    if (!t) {
      failed++;
      continue;
    }
    const args = JSON.stringify({
      sourceId: r.sourceId,
      locale: 'es',
      title: t.title,
      description: t.description,
    });
    try {
      execFileSync(
        'pnpm',
        ['exec', 'convex', 'run', 'resourceMigration:setTranslationBySourceId', args],
        { cwd: repoRoot, stdio: 'pipe', env: process.env },
      );
      pushed++;
      if (pushed % 25 === 0) console.log(`  pushed ${pushed}/${rows.length}`);
    } catch (err) {
      failed++;
      console.error(`  push failed for ${r.sourceId}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log('\n────────── translation summary ──────────');
  console.log(`  rows in CSV:       ${rows.length}`);
  console.log(`  translated total:  ${Object.keys(cache).length}`);
  console.log(`  pushed to Convex:  ${pushed}`);
  console.log(`  failed pushes:     ${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
