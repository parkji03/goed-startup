import { describe, expect, it } from "vitest";
import { assignCategory, cleanTags } from "../lib/resources/migration-rules";

describe("assignCategory", () => {
  it("maps 'Innovation Fund' titles to capital-funding", () => {
    expect(assignCategory({ title: "Utah Innovation Fund", topics: [] })).toEqual({
      category: "capital-funding",
      confidence: "high",
    });
  });

  it("maps 'Job Corps' titles to workforce-talent", () => {
    expect(assignCategory({ title: "Clearfield Job Corps", topics: [] })).toEqual({
      category: "workforce-talent",
      confidence: "high",
    });
  });

  it("maps 'Chamber of Commerce' titles to community-events", () => {
    expect(assignCategory({ title: "Davis Chamber of Commerce", topics: [] })).toEqual({
      category: "community-events",
      confidence: "high",
    });
  });

  it("maps 'University' / 'College' titles to education-training", () => {
    expect(assignCategory({ title: "Utah State University Extension", topics: [] }).category).toBe(
      "education-training",
    );
  });

  it("uses topics signal when title is generic", () => {
    expect(
      assignCategory({ title: "Acme Resource", topics: ["Funding", "Mentorship"] }).category,
    ).toBe("capital-funding");
  });

  it("falls back to government-econdev with low confidence for unmatched", () => {
    expect(assignCategory({ title: "Unknown XYZ", topics: [] })).toEqual({
      category: "government-econdev",
      confidence: "low",
    });
  });

  it("strips stage values from topics in cleanTags", () => {
    expect(
      cleanTags(["Pre-seed", "Funding", "Late Stage Growth", "mentorship", "Pre-seed"]),
    ).toEqual(["Funding", "mentorship"]);
  });
});
