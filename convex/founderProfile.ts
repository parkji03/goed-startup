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
