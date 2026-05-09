import type { ResourceCategoryKey } from "./categories";

type Confidence = "high" | "medium" | "low";

type Rule = {
  match: RegExp;
  category: ResourceCategoryKey;
  confidence: Confidence;
};

const TITLE_RULES: Rule[] = [
  // capital-funding
  {
    match: /\b(innovation fund|venture|capital|angels?|grants?|seed fund|investors?)\b/i,
    category: "capital-funding",
    confidence: "high",
  },
  // programs-accelerators
  {
    match: /\b(accelerator|incubator|cohort|residency|founders|launch ?pad|boom ?startup|y ?combinator)\b/i,
    category: "programs-accelerators",
    confidence: "high",
  },
  // workforce-talent
  {
    match: /\b(job corps|workforce|apprentice|talent|hiring|workforce services|career center)\b/i,
    category: "workforce-talent",
    confidence: "high",
  },
  // legal-ip-operations
  {
    match: /\b(legal|attorney|lawyer|patent|trademark|ip clinic|compliance)\b/i,
    category: "legal-ip-operations",
    confidence: "high",
  },
  // mentorship-advisory
  {
    match: /\b(mentor|advisory|advisors?|score|coaching|EIR|executive in residence)\b/i,
    category: "mentorship-advisory",
    confidence: "high",
  },
  // community-events
  {
    match: /\b(chamber|meetup|conference|summit|alliance|association|network|community)\b/i,
    category: "community-events",
    confidence: "high",
  },
  // education-training
  {
    match: /\b(university|college|institute|extension|school|academy|certification|course|training)\b/i,
    category: "education-training",
    confidence: "high",
  },
  // government-econdev
  {
    match: /\b(department of|economic development|edc|state of utah|county|city of|government)\b/i,
    category: "government-econdev",
    confidence: "high",
  },
];

const TOPIC_RULES: Array<{ match: RegExp; category: ResourceCategoryKey }> = [
  { match: /\b(funding|capital|investment)\b/i, category: "capital-funding" },
  { match: /\b(accelerator|incubator|program)\b/i, category: "programs-accelerators" },
  { match: /\b(workforce|talent|hiring|employment)\b/i, category: "workforce-talent" },
  { match: /\b(legal|ip|patent)\b/i, category: "legal-ip-operations" },
  { match: /\b(mentor|advisory)\b/i, category: "mentorship-advisory" },
  { match: /\b(community|event|networking)\b/i, category: "community-events" },
  { match: /\b(education|training|course)\b/i, category: "education-training" },
];

export function assignCategory(input: { title: string; topics: string[] }): {
  category: ResourceCategoryKey;
  confidence: Confidence;
} {
  for (const rule of TITLE_RULES) {
    if (rule.match.test(input.title)) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }
  const topicHay = input.topics.join(" ");
  for (const rule of TOPIC_RULES) {
    if (rule.match.test(topicHay)) {
      return { category: rule.category, confidence: "medium" };
    }
  }
  return { category: "government-econdev", confidence: "low" };
}

const STAGE_FRAGMENTS = [
  "pre-seed",
  "pre seed",
  "seed",
  "series a",
  "series b",
  "series c",
  "growth",
  "late stage",
  "early stage",
  "idea stage",
];

export function cleanTags(topics: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of topics) {
    const t = raw.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (STAGE_FRAGMENTS.some((s) => lower.includes(s))) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(t);
  }
  return out;
}
