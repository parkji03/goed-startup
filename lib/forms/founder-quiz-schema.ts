import { z } from "zod";

import type { FounderProfileConvex } from "@/convex/founderProfile";
import { emptyFounderProfile } from "@/convex/founderProfile";

const stringBuckets = z.array(z.string());

/**
 * Matches `founderProfileValidator` in `convex/founderProfile.ts` and localStorage payload shape.
 */
export const founderQuizSchema = z.object({
  stages: stringBuckets,
  counties: stringBuckets,
  industries: stringBuckets,
  audiences: stringBuckets,
  specialStatuses: stringBuckets,
  goals: stringBuckets,
  freeText: z.string().optional(),
});

/** `useWatch` can yield partial snapshots; Convex queries need full buckets. */
export function coalesceQuizForm(value: Partial<FounderProfileConvex> | undefined): FounderProfileConvex {
  const base = emptyFounderProfile();
  if (!value) return base;
  const freeText =
    "freeText" in value && typeof value.freeText === "string"
      ? value.freeText.trim() || undefined
      : undefined;
  return {
    stages: Array.isArray(value.stages) ? value.stages : base.stages,
    counties: Array.isArray(value.counties) ? value.counties : base.counties,
    industries: Array.isArray(value.industries) ? value.industries : base.industries,
    audiences: Array.isArray(value.audiences) ? value.audiences : base.audiences,
    specialStatuses: Array.isArray(value.specialStatuses)
      ? value.specialStatuses
      : base.specialStatuses,
    goals: Array.isArray(value.goals) ? value.goals : base.goals,
    ...(freeText !== undefined ? { freeText } : {}),
  };
}

/** Merge defaults with parsed JSON from localStorage; drop invalid payloads. */
export function normalizeQuizStorage(raw: unknown): FounderProfileConvex | null {
  const merged = {
    ...emptyFounderProfile(),
    ...(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}),
  };
  const r = founderQuizSchema.safeParse(merged);
  return r.success ? r.data : null;
}
