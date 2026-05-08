"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { api } from "@/convex/_generated/api";
import { emptyFounderProfile } from "@/convex/founderProfile";
import { coalesceQuizForm, founderQuizSchema } from "@/lib/forms/founder-quiz-schema";
import type { QuizAnswers } from "@/lib/founder-quiz";
import { loadQuizAnswers, saveQuizAnswers } from "@/lib/founder-quiz";

import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Link, useRouter } from "@/i18n/navigation";

const STAGES = ["Idea / discovery", "Building MVP", "Early revenue", "Growth / scale"] as const;

const COUNTIES_SAMPLE = [
  "Salt Lake",
  "Utah",
  "Davis",
  "Weber",
  "Washington",
  "Carbon",
  "Rural / statewide",
] as const;

const INDUSTRIES_SAMPLE = [
  "Software & Information Technology",
  "Manufacturing",
  "Life Sciences and Healthcare",
  "Financial Services",
  "Aerospace and Defense",
  "Energy",
  "Other",
] as const;

const GOALS_SAMPLE = [
  "Funding",
  "Start a Business",
  "International Trade",
  "Marketing and Sales",
  "Relocation",
  "Taxes/finance",
  "Late Stage Growth",
  "Resources for Entrepreneurs Communities",
] as const;

const AUDIENCE_SAMPLE = [
  "Student",
  "Veteran",
  "Women",
  "Rural",
  "Multicultural",
  "New Americans",
  "None of these",
] as const;

function toggle(arr: string[], value: string) {
  const set = new Set(arr);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

export function FounderQuizClient() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const form = useForm<QuizAnswers>({
    resolver: zodResolver(founderQuizSchema),
    defaultValues: emptyFounderProfile(),
  });

  const { control, setValue, getValues, reset } = form;

  useEffect(() => {
    const loaded = loadQuizAnswers();
    if (loaded) reset(loaded);
  }, [reset]);

  const rawWatch = useWatch({ control });
  const profile = coalesceQuizForm(rawWatch ?? undefined);

  const recos = useQuery(
    api.resources.recommendForProfile,
    step >= 6 ? { founderProfile: profile, limit: 24 } : "skip",
  );

  useEffect(() => {
    if (step >= 6) {
      saveQuizAnswers(profile);
    }
  }, [step, profile]);

  const pills = (
    items: readonly string[],
    field: keyof Pick<
      QuizAnswers,
      "stages" | "counties" | "industries" | "goals" | "audiences"
    >,
  ) => (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <Button
          key={s}
          size="sm"
          intent={profile[field].includes(s) ? "primary" : "secondary"}
          onPress={() => {
            const next = toggle(getValues(field), s);
            setValue(field, next, { shouldDirty: true, shouldValidate: true });
          }}
        >
          {s}
        </Button>
      ))}
    </div>
  );

  function renderBody() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-3">
            <Text className="text-muted-fg">Where are you in the journey?</Text>
            {pills(STAGES, "stages")}
          </div>
        );
      case 1:
        return (
          <div className="space-y-3">
            <Text className="text-muted-fg">Where are you building from?</Text>
            {pills(COUNTIES_SAMPLE, "counties")}
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <Text className="text-muted-fg">Industry focus</Text>
            {pills(INDUSTRIES_SAMPLE, "industries")}
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <Text className="text-muted-fg">What outcome matters most?</Text>
            {pills(GOALS_SAMPLE, "goals")}
          </div>
        );
      case 4:
        return (
          <div className="space-y-3">
            <Text className="text-muted-fg">Communities / special focus</Text>
            {pills(AUDIENCE_SAMPLE, "audiences")}
          </div>
        );
      case 5:
        return (
          <div className="space-y-3">
            <label htmlFor="quiz-free" className="font-medium text-fg text-sm">
              Free text (optional)
            </label>
            <Controller
              name="freeText"
              control={control}
              render={({ field }) => (
                <Input {...field} value={field.value ?? ""} id="quiz-free" placeholder="Tell us what you’re trying to do..." />
              )}
            />
            {form.formState.errors.freeText?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">
                {form.formState.errors.freeText.message}
              </Text>
            ) : null}
          </div>
        );
      case 6:
        return (
          <div className="space-y-4">
            <Text className="text-muted-fg">
              Personalized recommendations grounded in Convex + your taxonomy answers.
            </Text>
            {recos === undefined ? (
              <Text>Computing matches…</Text>
            ) : (
              <>
                <RecoBlock title="Start here" rows={recos.startHere} />
                <RecoBlock title="Useful next" rows={recos.next} />
                <RecoBlock title="Explore deeper" rows={recos.explore} />
              </>
            )}
            <Link
              href="/guide"
              className="inline-flex rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Open AI guide (profile saved locally)
            </Link>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Heading level={1} className="text-3xl tracking-tight">
        Founder intake
      </Heading>
      <Text className="mt-3 text-muted-fg">
        Short quiz → deterministic matches. Skippable — power users can ⌘K search instantly.
      </Text>
      <div className="mt-10 space-y-6">
        <Text className="text-muted-fg text-xs font-semibold uppercase tracking-wide">
          Step {step + 1} / 7
        </Text>
        {renderBody()}
      </div>
      <div className="mt-8 flex flex-wrap gap-3">
        {step > 0 && step <= 6 ? (
          <Button intent="outline" size="sm" onPress={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </Button>
        ) : null}
        {step < 5 ? (
          <Button intent="primary" size="sm" onPress={() => setStep((s) => s + 1)}>
            Continue
          </Button>
        ) : null}
        {step === 5 ? (
          <Button intent="primary" size="sm" onPress={() => setStep(6)}>
            See recommendations
          </Button>
        ) : null}
        <Button intent="outline" size="sm" className="ms-auto" onPress={() => router.push("/resources")}>
          Skip quiz
        </Button>
      </div>
    </div>
  );
}

function RecoBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ title: string; slug: string; reason?: string }>;
}) {
  if (!rows?.length) return null;
  return (
    <div>
      <Heading level={3} className="text-lg">
        {title}
      </Heading>
      <ul className="mt-3 list-disc space-y-2 ps-6">
        {rows.map((r) => (
          <li key={r.slug}>
            <Link href={`/resources/${r.slug}`} className="font-medium text-primary underline">
              {r.title}
            </Link>
            {r.reason ? <Text className="text-muted-fg mt-1 block text-xs">{r.reason}</Text> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
