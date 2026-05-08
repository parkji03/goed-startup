import { v } from 'convex/values';

/**
 * Quiz / AI handoff profile — keep in sync with quiz client storage shape.
 */
export const founderProfileValidator = v.object({
  stages: v.array(v.string()),
  counties: v.array(v.string()),
  industries: v.array(v.string()),
  /** Maps to resource "communities" + special founder audiences. */
  audiences: v.array(v.string()),
  specialStatuses: v.array(v.string()),
  /** Maps to resource "topics". */
  goals: v.array(v.string()),
  freeText: v.optional(v.string()),
});

export type FounderProfileConvex = {
  stages: string[];
  counties: string[];
  industries: string[];
  audiences: string[];
  specialStatuses: string[];
  goals: string[];
  freeText?: string | undefined;
};

export const emptyFounderProfile = (): FounderProfileConvex => ({
  stages: [],
  counties: [],
  industries: [],
  audiences: [],
  specialStatuses: [],
  goals: [],
});

const MAX_LIST_LEN = 48;
const MAX_TAG_LEN = 200;
const MAX_FREE_TEXT = 2000;

/** Server-side caps for Convex actions/queries — keeps prompts and payloads bounded. */
export function clampFounderProfileForConvex(p: FounderProfileConvex): FounderProfileConvex {
  const cap = <T extends string[]>(a: T) =>
    a.slice(0, MAX_LIST_LEN).map((x) => x.slice(0, MAX_TAG_LEN)) as T;
  const ft = p.freeText?.slice(0, MAX_FREE_TEXT);
  return {
    stages: cap(p.stages),
    counties: cap(p.counties),
    industries: cap(p.industries),
    audiences: cap(p.audiences),
    specialStatuses: cap(p.specialStatuses),
    goals: cap(p.goals),
    freeText: ft?.trim() ? ft.trim() : undefined,
  };
}
