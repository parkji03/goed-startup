"use client";

import { SparklesIcon } from "@heroicons/react/20/solid";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  useFilteredCompanies,
  type EntityForList,
} from "@/hooks/useFilteredCompanies";
import {
  parseFiltersFromParams,
  type MapFilters,
} from "@/lib/companies/filters";
import {
  EMPLOYEE_COUNTS,
  HIRING_STATUS_IDS,
  SECTOR_IDS,
  STAGES,
  type EmployeeCountId,
  type HiringStatusFilterId,
  type SectorId,
  type StageId,
} from "@/lib/companies/taxonomy";
import {
  CHEQUE_BUCKETS,
  INVESTOR_STAGE_IDS,
  INVESTOR_TYPE_IDS,
  type ChequeBucketId,
  type InvestorStageId,
  type InvestorTypeId,
} from "@/lib/investors/taxonomy";
import type {
  MapPersona,
  MapQuizAnswers,
  MapRecommendCandidate,
} from "@/lib/map-recommend/prompt";
import { useMapQuiz } from "@/components/map/map-quiz-provider";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

/**
 * Multi-step questionnaire that mirrors the founder quiz pattern but is
 * scoped to the map. Step 1 picks the persona; step 2 collects filter-chip
 * preferences relevant to that persona; step 3 collects optional free
 * text. Submit closes the modal and posts a payload through MapQuizProvider
 * that the chat sidebar then turns into a streaming LLM recommendation.
 */

type Persona = MapPersona;

// Pretty labels for the persona-specific chip groups. Kept colocated here
// (not in i18n) because the map quiz is hackathon-scoped and the founder
// quiz uses the same approach.
const SECTOR_LABELS: Record<SectorId, string> = {
  "b2b-software": "B2B Software",
  consumer: "Consumer",
  fintech: "FinTech",
  "bio-medical": "Bio / Medical",
  security: "Security",
  energy: "Energy",
  marketplaces: "Marketplaces",
  other: "Other",
};

const STAGE_LABELS: Record<StageId, string> = {
  "pre-seed": "Pre-Seed",
  seed: "Seed",
  "series-a": "Series A",
  "series-b": "Series B",
  "series-c": "Series C",
  "series-d-plus": "Series D+",
  bootstrapped: "Bootstrapped",
};

const EMPLOYEE_LABELS: Record<EmployeeCountId, string> = {
  "2-10": "2–10",
  "11-50": "11–50",
  "51-200": "51–200",
  "201-500": "201–500",
  "501-1k": "501–1K",
  "1k-5k": "1K–5K",
};

const HIRING_LABELS: Record<HiringStatusFilterId, string> = {
  hiring: "Currently hiring",
  "not-hiring": "Not hiring",
};

const INVESTOR_TYPE_LABELS: Record<InvestorTypeId, string> = {
  vc: "VC",
  "corporate-vc": "Corporate VC",
  "pe-fund": "PE fund",
  "public-fund": "Public fund",
  "family-office": "Family office",
  "angel-network": "Angel network",
  "solo-angel": "Solo angel",
  "incubator-accelerator": "Incubator / Accelerator",
  "startup-studio": "Startup studio",
  "revenue-based": "Revenue-based",
  other: "Other",
};

const INVESTOR_STAGE_LABELS: Record<InvestorStageId, string> = {
  idea: "Idea",
  prototype: "Prototype",
  "early-revenue": "Early revenue",
  scaling: "Scaling",
  growth: "Growth",
  "pre-ipo": "Pre-IPO",
};

const CHEQUE_LABELS: Record<ChequeBucketId, string> = {
  "under-50k": "Under $50K",
  "50k-250k": "$50K–$250K",
  "250k-1m": "$250K–$1M",
  "1m-5m": "$1M–$5M",
  "5m-plus": "$5M+",
};

type Selections = {
  // Investor-persona (looking at startups)
  sectors: SectorId[];
  stages: StageId[];
  employeeCounts: EmployeeCountId[];
  hiringStatuses: HiringStatusFilterId[];
  // Founder-persona (looking at investors)
  investorTypes: InvestorTypeId[];
  investorStages: InvestorStageId[];
  chequeBuckets: ChequeBucketId[];
};

const EMPTY_SELECTIONS: Selections = {
  sectors: [],
  stages: [],
  employeeCounts: [],
  hiringStatuses: [],
  investorTypes: [],
  investorStages: [],
  chequeBuckets: [],
};

type MapQuizClientProps = {
  /** Closes the modal. Wired up by the provider. */
  onClose: () => void;
};

export function MapQuizClient({ onClose }: MapQuizClientProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [selections, setSelections] = useState<Selections>(EMPTY_SELECTIONS);
  const [freeText, setFreeText] = useState("");

  const { submitQuiz } = useMapQuiz();
  const sidebar = useSidebar();

  // Subscribe to whatever's currently visible on the map. The map page
  // reads URL filters; we read the same URL via useSearchParams + the
  // shared `useFilteredCompanies` hook, so the candidate list always
  // matches what the user can see behind the modal.
  const searchParams = useSearchParams();
  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );
  // Force the layer to include the persona's target kind even if the user
  // had it filtered out — recommending investors with the investor layer
  // off would return zero candidates.
  const augmentedFilters = useMemo<MapFilters>(() => {
    if (!persona) return filters;
    const wantsKind: 'company' | 'investor' =
      persona === 'founder' ? 'investor' : 'company';
    if (filters.types.includes(wantsKind)) return filters;
    return { ...filters, types: [...filters.types, wantsKind] };
  }, [filters, persona]);
  const filtered = useFilteredCompanies(augmentedFilters);
  const candidatePool = useMemo<MapRecommendCandidate[]>(() => {
    if (!filtered || !persona) return [];
    const wantsKind = persona === 'founder' ? 'investor' : 'company';
    return toCandidates(filtered.entities.filter((e) => e.kind === wantsKind));
  }, [filtered, persona]);

  const handleSubmit = () => {
    if (!persona) return;
    const answers: MapQuizAnswers = {
      selections: selectionsToHumanLabels(persona, selections),
      freeText: freeText.trim(),
    };
    // We deliberately do NOT mutate the layer URL state on submit. The
    // candidate fetch above uses `augmentedFilters` so the LLM still gets
    // the persona's target kind to rank within, but the user's visible
    // map stays exactly as they left it. If they click a recommendation
    // for an entity that isn't currently rendered (layer off), the map
    // page's select handler can decide what to do with it.
    submitQuiz({
      persona,
      answers,
      candidates: candidatePool,
    });
    sidebar.setOpen(true);
    onClose();
  };

  // ---- Step 0: Persona ---------------------------------------------------
  if (step === 0) {
    return (
      <div className="space-y-6">
        <Text className="text-muted-fg">
          Two quick steps. The AI guide will rank the {persona === 'founder' ? 'investors' : 'matches'} from the markers
          currently visible on the map and link each one — click to fly to the
          marker.
        </Text>
        <div className="space-y-3">
          <Text className="font-medium text-fg">Which describes you best?</Text>
          <div className="grid gap-3 sm:grid-cols-2">
            <PersonaCard
              title="I'm a founder"
              body="Looking for investors that match my stage, cheque size, and focus."
              selected={persona === "founder"}
              onPress={() => setPersona("founder")}
            />
            <PersonaCard
              title="I'm an investor"
              body="Looking for Utah startups that match my thesis."
              selected={persona === "investor"}
              onPress={() => setPersona("investor")}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            intent="primary"
            size="sm"
            isDisabled={!persona}
            onPress={() => setStep(1)}
          >
            Continue
          </Button>
          <Button intent="outline" size="sm" className="ms-auto" onPress={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---- Step 1: Preferences ----------------------------------------------
  if (step === 1) {
    return (
      <div className="space-y-6">
        <Text className="text-muted-fg text-xs font-semibold uppercase tracking-wide">
          Step 2 / 3
        </Text>
        {persona === "investor" ? (
          <div className="space-y-6">
            <Section title="Which sectors interest you?">
              <Pill
                items={SECTOR_IDS}
                labels={SECTOR_LABELS}
                selected={selections.sectors}
                onToggle={(id) =>
                  setSelections((s) => ({ ...s, sectors: toggleValue(s.sectors, id) }))
                }
              />
            </Section>
            <Section title="What stages do you back?">
              <Pill
                items={STAGES.map((s) => s.id) as readonly StageId[]}
                labels={STAGE_LABELS}
                selected={selections.stages}
                onToggle={(id) =>
                  setSelections((s) => ({ ...s, stages: toggleValue(s.stages, id) }))
                }
              />
            </Section>
            <Section title="Team size you'd consider">
              <Pill
                items={EMPLOYEE_COUNTS.map((e) => e.id) as readonly EmployeeCountId[]}
                labels={EMPLOYEE_LABELS}
                selected={selections.employeeCounts}
                onToggle={(id) =>
                  setSelections((s) => ({
                    ...s,
                    employeeCounts: toggleValue(s.employeeCounts, id),
                  }))
                }
              />
            </Section>
            <Section title="Hiring activity (optional)">
              <Pill
                items={HIRING_STATUS_IDS}
                labels={HIRING_LABELS}
                selected={selections.hiringStatuses}
                onToggle={(id) =>
                  setSelections((s) => ({
                    ...s,
                    hiringStatuses: toggleValue(s.hiringStatuses, id),
                  }))
                }
              />
            </Section>
          </div>
        ) : (
          <div className="space-y-6">
            <Section title="Cheque size you're raising">
              <Pill
                items={CHEQUE_BUCKETS.map((b) => b.id) as readonly ChequeBucketId[]}
                labels={CHEQUE_LABELS}
                selected={selections.chequeBuckets}
                onToggle={(id) =>
                  setSelections((s) => ({
                    ...s,
                    chequeBuckets: toggleValue(s.chequeBuckets, id),
                  }))
                }
              />
            </Section>
            <Section title="Investor type">
              <Pill
                items={INVESTOR_TYPE_IDS}
                labels={INVESTOR_TYPE_LABELS}
                selected={selections.investorTypes}
                onToggle={(id) =>
                  setSelections((s) => ({
                    ...s,
                    investorTypes: toggleValue(s.investorTypes, id),
                  }))
                }
              />
            </Section>
            <Section title="Where you are in your journey">
              <Pill
                items={INVESTOR_STAGE_IDS}
                labels={INVESTOR_STAGE_LABELS}
                selected={selections.investorStages}
                onToggle={(id) =>
                  setSelections((s) => ({
                    ...s,
                    investorStages: toggleValue(s.investorStages, id),
                  }))
                }
              />
            </Section>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button intent="outline" size="sm" onPress={() => setStep(0)}>
            Back
          </Button>
          <Button intent="primary" size="sm" onPress={() => setStep(2)}>
            Continue
          </Button>
          <Button intent="outline" size="sm" className="ms-auto" onPress={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ---- Step 2: Free text + submit ---------------------------------------
  const candidateCount = candidatePool.length;
  const targetLabel = persona === 'founder' ? 'investors' : 'startups';
  return (
    <div className="space-y-6">
      <Text className="text-muted-fg text-xs font-semibold uppercase tracking-wide">
        Step 3 / 3
      </Text>
      <Section title="Anything specific you want the AI to consider? (optional)">
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          maxLength={600}
          rows={4}
          placeholder={
            persona === "founder"
              ? "e.g., we're a B2B SaaS at $30K MRR, raising a $1.5M seed round, prefer leads who've taken board seats."
              : "e.g., I lead seed checks of $500K–$1M, prefer hardware-adjacent or vertical SaaS with founder-led GTM."
          }
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Section>
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <Text className="text-xs text-muted-fg">
          The AI will rank up to 8 {targetLabel} from the{" "}
          <span className="font-medium text-fg tabular-nums">{candidateCount}</span>{" "}
          {targetLabel} currently visible on the map. Each result links to its
          marker — click to open the profile.
        </Text>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button intent="outline" size="sm" onPress={() => setStep(1)}>
          Back
        </Button>
        <Button
          intent="primary"
          size="sm"
          isDisabled={candidateCount === 0}
          onPress={handleSubmit}
        >
          <SparklesIcon />
          Get recommendations
        </Button>
        <Button intent="outline" size="sm" className="ms-auto" onPress={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function toggleValue<T extends string>(arr: T[], value: T): T[] {
  const set = new Set<T>(arr);
  if (set.has(value)) set.delete(value);
  else set.add(value);
  return [...set];
}

/**
 * Pill row for a chip group. Hoisted to module scope so it isn't
 * re-created per render of the parent (would otherwise reset internal
 * state on each keystroke and trip react-hooks/static-components).
 */
function Pill<T extends string>({
  items,
  labels,
  selected,
  onToggle,
}: {
  items: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((id) => (
        <Button
          key={id}
          size="sm"
          intent={selected.includes(id) ? 'primary' : 'secondary'}
          onPress={() => onToggle(id)}
        >
          {labels[id]}
        </Button>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <Text className="font-medium text-fg text-sm">{title}</Text>
      {children}
    </div>
  );
}

function PersonaCard({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={selected}
      className={[
        "flex flex-col gap-1.5 rounded-xl border px-4 py-3 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected
          ? "border-primary bg-primary/10"
          : "border-border bg-bg hover:bg-muted/40",
      ].join(" ")}
    >
      <span className="font-medium text-fg text-sm">{title}</span>
      <span className="text-muted-fg text-xs leading-relaxed">{body}</span>
    </button>
  );
}

/**
 * Translate the URL/taxonomy IDs into human-readable labels for the LLM
 * prompt. The model reasons in plain English, not slugs.
 */
function selectionsToHumanLabels(
  persona: Persona,
  s: Selections,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (persona === "investor") {
    if (s.sectors.length)
      out["Sectors"] = s.sectors.map((id) => SECTOR_LABELS[id]);
    if (s.stages.length)
      out["Stages"] = s.stages.map((id) => STAGE_LABELS[id]);
    if (s.employeeCounts.length)
      out["Team size"] = s.employeeCounts.map((id) => EMPLOYEE_LABELS[id]);
    if (s.hiringStatuses.length)
      out["Hiring"] = s.hiringStatuses.map((id) => HIRING_LABELS[id]);
  } else {
    if (s.chequeBuckets.length)
      out["Cheque size"] = s.chequeBuckets.map((id) => CHEQUE_LABELS[id]);
    if (s.investorTypes.length)
      out["Investor type"] = s.investorTypes.map((id) => INVESTOR_TYPE_LABELS[id]);
    if (s.investorStages.length)
      out["Stage of company"] = s.investorStages.map(
        (id) => INVESTOR_STAGE_LABELS[id],
      );
  }
  return out;
}

// Server caps the candidates list at 60 and truncates each text field to
// ~280 chars; we mirror those bounds client-side so we don't ship bytes
// the route is going to drop. Without this, a fully-loaded investor
// layer (~2.5k pins) overflows the body cap before it even leaves the
// browser.
const MAX_CANDIDATES = 60;
const MAX_TEXT_CHARS = 280;

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Trim the merged entity list down to the lean shape the API route accepts.
 * Drops the heavy fields (lng/lat, brief embeds), truncates long prose
 * (descriptions, investment theses), and caps the list at MAX_CANDIDATES
 * so the request body stays under the route's size guard.
 *
 * Selection is FIFO over the already-filtered set the user is looking
 * at — no scoring here. The LLM does the actual ranking once the prompt
 * lands. Future work: vector-search to pre-rank before truncation.
 */
function toCandidates(entities: EntityForList[]): MapRecommendCandidate[] {
  const slice = entities.slice(0, MAX_CANDIDATES);
  return slice.map((e): MapRecommendCandidate => {
    if (e.kind === "company") {
      return {
        _id: String(e._id),
        name: e.name,
        kind: "company",
        sector: e.sector ? SECTOR_LABELS[e.sector] : undefined,
        stage: e.stage ? STAGE_LABELS[e.stage] : undefined,
        city: e.location.city,
        employeeCount: e.employeeCount ? EMPLOYEE_LABELS[e.employeeCount] : undefined,
        hiring: typeof e.hiringStatus === "boolean" ? e.hiringStatus : undefined,
        description: truncate(e.description, MAX_TEXT_CHARS),
      };
    }
    return {
      _id: String(e._id),
      name: e.name,
      kind: "investor",
      investorType: e.investorType,
      investmentThesis: truncate(e.investmentThesis, MAX_TEXT_CHARS),
      // Cap the array fields too — investors with `countriesOfInvestment`
      // listing 80+ countries push the body just as much as a long thesis.
      stagesOfInvestment: e.stagesOfInvestment?.slice(0, 6),
      countriesOfInvestment: e.countriesOfInvestment?.slice(0, 6),
      firstChequeMin: e.firstChequeMin,
      firstChequeMax: e.firstChequeMax,
      country: e.location?.country,
    };
  });
}

