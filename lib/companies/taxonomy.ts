/**
 * Company taxonomy — single source of truth for sector, stage, and employee
 * count classification. Consumed by:
 *   - Convex schema validation (companies table)
 *   - Seed script (normalizes raw CSV strings into ids)
 *   - Map filter UI (renders chips/dropdowns from these arrays)
 *   - Mapbox data-driven styling (later: marker color by sector)
 *
 * Each taxonomy is an ordered, `as const` array so TypeScript infers literal
 * types automatically. Add new values here and the rest of the codebase
 * picks them up via the derived `*Id` types.
 *
 * Display labels live in i18n (messages/{locale}.json under the `Taxonomy`
 * namespace) — read them via `useTranslations('Taxonomy')` and call
 * `t(\`sectors.${id}\`)` etc. The taxonomy file itself is data-only.
 *
 * Stage and employeeCount are optional on a company — if the source data is
 * blank, the field is `undefined` and the schema marks it `v.optional(...)`.
 * Sector falls back to `'other'` since "Other" is itself a useful category.
 */

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export const SECTOR_IDS = [
  'b2b-software',
  'consumer',
  'fintech',
  'bio-medical',
  'security',
  'energy',
  'marketplaces',
  'other',
] as const;

export type SectorId = (typeof SECTOR_IDS)[number];

// ---------------------------------------------------------------------------
// Funding stage (ordered earliest → latest; bootstrapped sits outside the curve)
// ---------------------------------------------------------------------------

export const STAGES = [
  { id: 'pre-seed',      order: 1 },
  { id: 'seed',          order: 2 },
  { id: 'series-a',      order: 3 },
  { id: 'series-b',      order: 4 },
  { id: 'series-c',      order: 5 },
  { id: 'series-d-plus', order: 6 },
  { id: 'bootstrapped',  order: 0 },
] as const;

export type StageId = (typeof STAGES)[number]['id'];
export const STAGE_IDS = STAGES.map((s) => s.id) as readonly StageId[];

// ---------------------------------------------------------------------------
// Employee count buckets (already ordered)
// ---------------------------------------------------------------------------

export const EMPLOYEE_COUNTS = [
  { id: '2-10',    min: 2,    max: 10 },
  { id: '11-50',   min: 11,   max: 50 },
  { id: '51-200',  min: 51,   max: 200 },
  { id: '201-500', min: 201,  max: 500 },
  { id: '501-1k',  min: 501,  max: 1000 },
  { id: '1k-5k',   min: 1001, max: 5000 },
] as const;

export type EmployeeCountId = (typeof EMPLOYEE_COUNTS)[number]['id'];
export const EMPLOYEE_COUNT_IDS = EMPLOYEE_COUNTS.map((e) => e.id) as readonly EmployeeCountId[];

// ---------------------------------------------------------------------------
// CSV → id normalization (used by seed script)
// ---------------------------------------------------------------------------

const SECTOR_CSV: Record<string, SectorId> = {
  'B2B Software': 'b2b-software',
  'Consumer': 'consumer',
  'FinTech': 'fintech',
  'Bio/Medical Tech': 'bio-medical',
  'Security': 'security',
  'Energy': 'energy',
  'Marketplaces': 'marketplaces',
};

const STAGE_CSV: Record<string, StageId> = {
  'Pre-Seed': 'pre-seed',
  'Seed': 'seed',
  'Series A': 'series-a',
  'Series B': 'series-b',
  'Series C': 'series-c',
  'Series D+': 'series-d-plus',
  'Bootstrapped': 'bootstrapped',
};

const EMPLOYEE_COUNT_CSV: Record<string, EmployeeCountId> = {
  '2-10': '2-10',
  '11-50': '11-50',
  '51-200': '51-200',
  '201-500': '201-500',
  '501-1K': '501-1k',
  '1K-5K': '1k-5k',
};

export function normalizeSector(raw: string | null | undefined): SectorId {
  return SECTOR_CSV[(raw ?? '').trim()] ?? 'other';
}

export function normalizeStage(raw: string | null | undefined): StageId | undefined {
  return STAGE_CSV[(raw ?? '').trim()];
}

export function normalizeEmployeeCount(raw: string | null | undefined): EmployeeCountId | undefined {
  return EMPLOYEE_COUNT_CSV[(raw ?? '').trim()];
}

// ---------------------------------------------------------------------------
// Type guards (handy for parsing untrusted strings from URL params, etc.)
// ---------------------------------------------------------------------------

export function isSectorId(x: string): x is SectorId {
  return (SECTOR_IDS as readonly string[]).includes(x);
}

export function isStageId(x: string): x is StageId {
  return (STAGE_IDS as readonly string[]).includes(x);
}

export function isEmployeeCountId(x: string): x is EmployeeCountId {
  return (EMPLOYEE_COUNT_IDS as readonly string[]).includes(x);
}

// ---------------------------------------------------------------------------
// Lookup helpers (for UI that needs structural metadata — order, min/max)
// ---------------------------------------------------------------------------

export const stageById = (id: StageId) =>
  STAGES.find((s) => s.id === id)!;

export const employeeCountById = (id: EmployeeCountId) =>
  EMPLOYEE_COUNTS.find((e) => e.id === id)!;
