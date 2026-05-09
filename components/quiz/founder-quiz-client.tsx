"use client";

import { SparklesIcon } from "@heroicons/react/20/solid";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import { emptyFounderProfile } from "@/convex/founderProfile";
import { coalesceQuizForm, founderQuizSchema } from "@/lib/forms/founder-quiz-schema";
import type { QuizAnswers } from "@/lib/founder-quiz";
import { loadQuizAnswers, saveQuizAnswers } from "@/lib/founder-quiz";

import { useQuiz } from "@/components/quiz/quiz-provider";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { useSidebar } from "@/components/ui/sidebar";
import { Text } from "@/components/ui/text";
import { useRouter } from "@/i18n/navigation";

const KICKSTART_PROMPT = "What are some resources you'd recommend for me?";

type FounderQuizClientProps = {
  /** Called on skip or when finished — closes modal instead of navigating. */
  onComplete?: () => void;
};

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

const TOTAL_STEPS = 7;
const COMPLETION_STEP = 6;

function toggle(arr: string[], value: string) {
  const set = new Set(arr);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

export function FounderQuizClient({ onComplete }: FounderQuizClientProps = {}) {
  const router = useRouter();
  const sidebar = useSidebar();
  const { setPendingPrompt } = useQuiz();
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

  const close = () => (onComplete ? onComplete() : router.push("/resources"));
  const finish = () => {
    saveQuizAnswers(profile);
    setStep(COMPLETION_STEP);
  };
  const startChatting = () => {
    setPendingPrompt(KICKSTART_PROMPT);
    sidebar.setOpen(true);
    close();
  };

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
      case COMPLETION_STEP:
        return <CompletionScreen onStartChatting={startChatting} />;
      default:
        return null;
    }
  }

  const isCompletion = step === COMPLETION_STEP;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Heading level={1} className="text-3xl tracking-tight">
        {isCompletion ? "You’re set" : "Founder questionnaire"}
      </Heading>
      {!isCompletion ? (
        <Text className="mt-3 text-muted-fg">
          A few quick questions so the AI guide can tailor recommendations to your situation. Skippable any time.
        </Text>
      ) : null}
      <div className="mt-10 space-y-6">
        {!isCompletion ? (
          <Text className="text-muted-fg text-xs font-semibold uppercase tracking-wide">
            Step {step + 1} / {TOTAL_STEPS}
          </Text>
        ) : null}
        {renderBody()}
      </div>
      {!isCompletion ? (
        <div className="mt-8 flex flex-wrap gap-3">
          {step > 0 ? (
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
            <Button intent="primary" size="sm" onPress={finish}>
              Finish
            </Button>
          ) : null}
          <Button intent="outline" size="sm" className="ms-auto" onPress={close}>
            {onComplete ? "Close" : "Skip questionnaire"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CompletionScreen({ onStartChatting }: { onStartChatting: () => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
          <SparklesIcon className="size-5" />
        </span>
        <Heading level={2} className="text-xl">
          AI guide is now personalized
        </Heading>
      </div>
      <Text className="text-muted-fg">
        Your answers are saved on this device. The AI guide will weight its
        recommendations toward your industry, stage, location, and goals — and
        can still answer anything about Utah’s startup ecosystem.
      </Text>
      <div className="pt-2">
        <Button intent="primary" size="md" onPress={onStartChatting}>
          <SparklesIcon />
          Start chatting
        </Button>
      </div>
    </div>
  );
}

