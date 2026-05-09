export const RESOURCE_CATEGORY_KEYS = [
  "capital-funding",
  "programs-accelerators",
  "workforce-talent",
  "legal-ip-operations",
  "mentorship-advisory",
  "community-events",
  "education-training",
  "government-econdev",
] as const;

export type ResourceCategoryKey = (typeof RESOURCE_CATEGORY_KEYS)[number];

export const RESOURCE_CATEGORIES: ReadonlyArray<{
  key: ResourceCategoryKey;
  label: string;
  tagline: string;
}> = [
  { key: "capital-funding", label: "Capital & Funding", tagline: "VC, angels, grants, loans" },
  {
    key: "programs-accelerators",
    label: "Programs & Accelerators",
    tagline: "Cohorts, incubators, residencies",
  },
  {
    key: "workforce-talent",
    label: "Workforce & Talent",
    tagline: "Hiring, training, apprenticeships",
  },
  {
    key: "legal-ip-operations",
    label: "Legal, IP & Operations",
    tagline: "Legal clinics, IP, compliance",
  },
  {
    key: "mentorship-advisory",
    label: "Mentorship & Advisory",
    tagline: "EIRs, board help, 1:1 advising",
  },
  {
    key: "community-events",
    label: "Community & Events",
    tagline: "Meetups, chambers, conferences",
  },
  {
    key: "education-training",
    label: "Education & Training",
    tagline: "Universities, courses, certifications",
  },
  {
    key: "government-econdev",
    label: "Government & Econ Dev",
    tagline: "State/county programs, EDC offices",
  },
];

const LABEL_BY_KEY: Record<ResourceCategoryKey, string> = Object.fromEntries(
  RESOURCE_CATEGORIES.map((c) => [c.key, c.label]),
) as Record<ResourceCategoryKey, string>;

export function categoryLabel(key: ResourceCategoryKey): string {
  return LABEL_BY_KEY[key];
}

export function isResourceCategoryKey(value: unknown): value is ResourceCategoryKey {
  return (
    typeof value === "string" && (RESOURCE_CATEGORY_KEYS as readonly string[]).includes(value)
  );
}
