import { describe, expect, it } from "vitest";
import type { FounderProfileConvex } from "../convex/founderProfile";
import { scoreResourceForProfile } from "../convex/lib/matchResources";

const baseResource = () => ({
  communities: ["Veteran", "Women", "Student"] as string[],
  industries: ["Software & Information Technology"],
  locations: ["Salt Lake", "Washington"],
  topics: ["Funding", "International Trade"],
  stageTags: [] as string[],
});

describe("Hackathon personas score differently", () => {
  const jordan: FounderProfileConvex = {
    stages: [],
    counties: [],
    industries: [],
    audiences: [],
    specialStatuses: ["Veteran"],
    goals: ["Funding"],
    freeText: "defense contracting exit",
  };
  const maria: FounderProfileConvex = {
    stages: [],
    counties: ["Washington"],
    industries: [],
    audiences: [],
    specialStatuses: [],
    goals: ["International Trade"],
    freeText: "export packaged foods",
  };
  const david: FounderProfileConvex = {
    stages: [],
    counties: [],
    industries: [],
    audiences: [],
    specialStatuses: [],
    goals: ["Start a Business"],
    freeText: "student incubator",
  };

  const r = baseResource();

  it("Veteran + funding outweighs unrelated founder", () => {
    const sj = scoreResourceForProfile(r, jordan);
    const sm = scoreResourceForProfile({ ...r, communities: [], topics: [] }, jordan);
    expect(sj).toBeGreaterThan(sm);
  });

  it("International trade aligns with exporting resource", () => {
    const sm = scoreResourceForProfile(r, maria);
    const sd = scoreResourceForProfile({ ...r, topics: ["Start a Business"] }, maria);
    expect(sm).toBeGreaterThan(sd);
  });

  it("Student audience alignment increases score vs unrelated profile", () => {
    const withStudentAudience = scoreResourceForProfile(
      { ...r, communities: ["Student"], topics: [] },
      { ...david, audiences: ["Student"] },
    );
    const stranger = scoreResourceForProfile({ ...r, communities: [], topics: [] }, {
      ...david,
      audiences: [],
      specialStatuses: [],
    });
    expect(withStudentAudience).toBeGreaterThan(stranger);
  });
});
