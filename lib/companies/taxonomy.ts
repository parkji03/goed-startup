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
 * Stage and employeeCount are optional on a company — if the source data is
 * blank, the field is `undefined` and the schema marks it `v.optional(...)`.
 * Sector falls back to `'other'` since "Other" is itself a useful category.
 */

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export const SECTORS = [
  { id: 'b2b-software', label: 'B2B Software' },
  { id: 'consumer',     label: 'Consumer' },
  { id: 'fintech',      label: 'FinTech' },
  { id: 'bio-medical',  label: 'Bio/Medical Tech' },
  { id: 'security',     label: 'Security' },
  { id: 'energy',       label: 'Energy' },
  { id: 'marketplaces', label: 'Marketplaces' },
  { id: 'other',        label: 'Other' },
] as const;

export type SectorId = (typeof SECTORS)[number]['id'];
export const SECTOR_IDS = SECTORS.map((s) => s.id) as readonly SectorId[];

// ---------------------------------------------------------------------------
// Funding stage (ordered earliest → latest; bootstrapped sits outside the curve)
// ---------------------------------------------------------------------------

export const STAGES = [
  { id: 'pre-seed',      label: 'Pre-Seed',     order: 1 },
  { id: 'seed',          label: 'Seed',         order: 2 },
  { id: 'series-a',      label: 'Series A',     order: 3 },
  { id: 'series-b',      label: 'Series B',     order: 4 },
  { id: 'series-c',      label: 'Series C',     order: 5 },
  { id: 'series-d-plus', label: 'Series D+',    order: 6 },
  { id: 'bootstrapped',  label: 'Bootstrapped', order: 0 },
] as const;

export type StageId = (typeof STAGES)[number]['id'];
export const STAGE_IDS = STAGES.map((s) => s.id) as readonly StageId[];

// ---------------------------------------------------------------------------
// Employee count buckets (already ordered)
// ---------------------------------------------------------------------------

export const EMPLOYEE_COUNTS = [
  { id: '2-10',    label: '2–10',    min: 2,    max: 10 },
  { id: '11-50',   label: '11–50',   min: 11,   max: 50 },
  { id: '51-200',  label: '51–200',  min: 51,   max: 200 },
  { id: '201-500', label: '201–500', min: 201,  max: 500 },
  { id: '501-1k',  label: '501–1K',  min: 501,  max: 1000 },
  { id: '1k-5k',   label: '1K–5K',   min: 1001, max: 5000 },
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
// Lookup helpers (for UI)
// ---------------------------------------------------------------------------

export const sectorById = (id: SectorId) =>
  SECTORS.find((s) => s.id === id)!;

export const stageById = (id: StageId) =>
  STAGES.find((s) => s.id === id)!;

export const employeeCountById = (id: EmployeeCountId) =>
  EMPLOYEE_COUNTS.find((e) => e.id === id)!;
