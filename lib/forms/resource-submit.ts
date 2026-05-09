import { z } from "zod";
import { RESOURCE_CATEGORY_KEYS } from "@/lib/resources/categories";

function normalizeHttpsUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

export const resourceSubmitSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().trim().min(1, "Description is required"),
  url: z
    .string()
    .trim()
    .min(1, "URL is required")
    .transform(normalizeHttpsUrl)
    .refine(
      (s) => {
        try {
          new URL(s);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Enter a valid URL" },
    ),
  submitterName: z.string().trim().min(1, "Name is required"),
  submitterEmail: z.string().trim().min(1, "Email is required").pipe(z.email()),
  organization: z.string().trim().optional(),
  category: z.enum(RESOURCE_CATEGORY_KEYS, { message: "Pick a category" }),
  tags: z.string().optional(),
  notes: z.string().trim().optional(),
});

export type ResourceSubmitValues = z.infer<typeof resourceSubmitSchema>;

export function splitSuggestedTags(tags: string | undefined): string[] {
  if (!tags?.trim()) return [];
  return tags.split(/[,|;]/).map((s) => s.trim()).filter(Boolean);
}
