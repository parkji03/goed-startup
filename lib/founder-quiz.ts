import type { FounderProfileConvex } from "@/convex/founderProfile";

import { founderQuizSchema, normalizeQuizStorage } from "@/lib/forms/founder-quiz-schema";

export const FOUNDER_QUIZ_STORAGE_KEY = "goed-founder-quiz:v1";

export type QuizAnswers = FounderProfileConvex;

export function loadQuizAnswers(): QuizAnswers | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(FOUNDER_QUIZ_STORAGE_KEY);
    if (!raw) return null;
    return normalizeQuizStorage(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveQuizAnswers(profile: QuizAnswers) {
  const safe = founderQuizSchema.parse(profile);
  localStorage.setItem(FOUNDER_QUIZ_STORAGE_KEY, JSON.stringify(safe));
}

export function clearQuizAnswers() {
  localStorage.removeItem(FOUNDER_QUIZ_STORAGE_KEY);
}
