"use client";

import { ShieldCheckIcon } from "@heroicons/react/20/solid";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Form } from "react-aria-components";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Description, Label } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { NumberField } from "@/components/ui/number-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Text, TextLink } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import {
  EMPLOYEE_COUNT_IDS,
  SECTOR_IDS,
  STAGE_IDS,
  type EmployeeCountId,
  type SectorId,
  type StageId,
} from "@/lib/companies/taxonomy";
import {
  DashboardInvestorBriefSection,
  emptyBriefState,
  type InvestorBriefFormState,
  type MonetizationModelId,
  type TargetMarketId,
} from "@/components/dashboard/dashboard-investor-brief-section";
import { DashboardHistorySection } from "@/components/dashboard/dashboard-history-section";
import { DashboardListingsSection } from "@/components/dashboard/dashboard-listings-section";
import { DashboardLocationSection } from "@/components/dashboard/dashboard-location-section";
import { DashboardPhotosSection } from "@/components/dashboard/dashboard-photos-section";
import { DashboardSectionNav } from "@/components/dashboard/dashboard-section-nav";

type HiringSelectKey = "yes" | "no" | "unknown";

type FormState = {
  name: string;
  description: string;
  website: string;
  linkedin: string;
  sector: SectorId;
  stage: StageId | "";
  employeeCount: EmployeeCountId | "";
  yearFounded: number | null;
  hiring: HiringSelectKey;
  brief: InvestorBriefFormState;
};

function hiringDocToKey(value: Doc<"companies">["hiringStatus"]): HiringSelectKey {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function hiringKeyToDoc(key: HiringSelectKey): Doc<"companies">["hiringStatus"] {
  if (key === "yes") return true;
  if (key === "no") return false;
  return "unknown";
}

function rowToFormState(row: Doc<"companies">): FormState {
  const brief = row.investorBrief;
  return {
    name: row.name,
    description: row.description ?? "",
    website: row.website ?? "",
    linkedin: row.linkedin ?? "",
    sector: row.sector,
    stage: row.stage ?? "",
    employeeCount: row.employeeCount ?? "",
    yearFounded: row.yearFounded ?? null,
    hiring: hiringDocToKey(row.hiringStatus),
    brief: brief
      ? {
          pitch: brief.pitch ?? "",
          productCategory: brief.productCategory ?? "",
          targetMarket: (brief.targetMarket ?? "") as TargetMarketId | "",
          monetizationModel: (brief.monetizationModel ?? "") as
            | MonetizationModelId
            | "",
          openRoleCount: brief.openRoleCount ?? null,
          differentiationClaim: brief.differentiationClaim?.claim ?? "",
          founders:
            brief.founders?.map((f) => ({
              name: f.name,
              title: f.title ?? "",
              priorCompanies: f.priorCompanies ?? [],
            })) ?? [],
          notableCustomers: brief.notableCustomers ?? [],
          keyMetrics:
            brief.keyMetrics?.map((m) => ({
              metric: m.metric,
              value: m.value,
            })) ?? [],
          integrations: brief.integrations ?? [],
          fundingRound: brief.funding?.round ?? "",
          fundingAmount: brief.funding?.amountUsd ?? null,
          fundingLeadInvestor: brief.funding?.leadInvestor ?? "",
        }
      : { ...emptyBriefState },
  };
}

/**
 * Build the diff sent to `updateMyCompany`. Only top-level fields that
 * actually changed land in the patch; the brief is included whenever any
 * brief field has been touched (treated as a full-replacement payload by
 * the server).
 */
function buildPatch(state: FormState, row: Doc<"companies">) {
  const patch: Record<string, unknown> = {};

  const trimmedName = state.name.trim();
  if (trimmedName && trimmedName !== row.name) patch.name = trimmedName;

  const description = state.description.trim();
  if ((description || row.description) && description !== (row.description ?? "")) {
    patch.description = description.length ? description : undefined;
  }

  const website = state.website.trim();
  if ((website || row.website) && website !== (row.website ?? "")) {
    patch.website = website.length ? website : undefined;
  }

  const linkedin = state.linkedin.trim();
  if ((linkedin || row.linkedin) && linkedin !== (row.linkedin ?? "")) {
    patch.linkedin = linkedin.length ? linkedin : undefined;
  }

  if (state.sector !== row.sector) patch.sector = state.sector;

  const stage = state.stage === "" ? undefined : state.stage;
  if (stage !== row.stage) patch.stage = stage;

  const employeeCount = state.employeeCount === "" ? undefined : state.employeeCount;
  if (employeeCount !== row.employeeCount) patch.employeeCount = employeeCount;

  const yearFounded = state.yearFounded ?? undefined;
  if (yearFounded !== row.yearFounded) patch.yearFounded = yearFounded;

  const hiring = hiringKeyToDoc(state.hiring);
  if (hiring !== row.hiringStatus) patch.hiringStatus = hiring;

  const briefPatch = buildBriefPatch(state.brief, row.investorBrief);
  if (briefPatch !== null) patch.investorBrief = briefPatch;

  return patch;
}

/**
 * Returns a patch object for `investorBrief` if any field differs from
 * the existing doc, or `null` if no brief change is needed. The shape
 * matches the server's `investorBriefPatchValidator` — provenance fields
 * (sourceQuotes, pagesCrawled, flags, extractedAt) aren't included; the
 * server clears them on its own.
 */
function buildBriefPatch(
  state: InvestorBriefFormState,
  existing: Doc<"companies">["investorBrief"],
) {
  const out: Record<string, unknown> = {};

  const pitch = state.pitch.trim();
  if (pitch !== (existing?.pitch ?? "")) out.pitch = pitch || undefined;

  const productCategory = state.productCategory.trim();
  if (productCategory !== (existing?.productCategory ?? "")) {
    out.productCategory = productCategory || undefined;
  }

  if ((state.targetMarket || "") !== (existing?.targetMarket ?? "")) {
    out.targetMarket = state.targetMarket || undefined;
  }

  if ((state.monetizationModel || "") !== (existing?.monetizationModel ?? "")) {
    out.monetizationModel = state.monetizationModel || undefined;
  }

  if ((state.openRoleCount ?? null) !== (existing?.openRoleCount ?? null)) {
    out.openRoleCount =
      state.openRoleCount == null ? undefined : state.openRoleCount;
  }

  const claim = state.differentiationClaim.trim();
  if (claim !== (existing?.differentiationClaim?.claim ?? "")) {
    out.differentiationClaim = claim ? { claim } : undefined;
  }

  // For arrays, structural compare is overkill — the server treats the
  // brief as full-replacement, so any non-empty form input means "use
  // this list now". Compare by JSON stringification for cheap diff.
  const foundersNext = state.founders
    .filter((f) => f.name.trim().length > 0)
    .map((f) => ({
      name: f.name.trim(),
      title: f.title.trim() || undefined,
      priorCompanies: f.priorCompanies.length ? f.priorCompanies : undefined,
    }));
  const foundersExisting =
    existing?.founders?.map((f) => ({
      name: f.name,
      title: f.title || undefined,
      priorCompanies: f.priorCompanies?.length ? f.priorCompanies : undefined,
    })) ?? [];
  if (JSON.stringify(foundersNext) !== JSON.stringify(foundersExisting)) {
    out.founders = foundersNext;
  }

  const customersNext = state.notableCustomers.map((c) => c.trim()).filter(Boolean);
  const customersExisting = existing?.notableCustomers ?? [];
  if (JSON.stringify(customersNext) !== JSON.stringify(customersExisting)) {
    out.notableCustomers = customersNext;
  }

  const metricsNext = state.keyMetrics
    .filter((m) => m.metric.trim() && m.value.trim())
    .map((m) => ({ metric: m.metric.trim(), value: m.value.trim() }));
  const metricsExisting =
    existing?.keyMetrics?.map((m) => ({ metric: m.metric, value: m.value })) ??
    [];
  if (JSON.stringify(metricsNext) !== JSON.stringify(metricsExisting)) {
    out.keyMetrics = metricsNext;
  }

  const integrationsNext = state.integrations.map((i) => i.trim()).filter(Boolean);
  const integrationsExisting = existing?.integrations ?? [];
  if (JSON.stringify(integrationsNext) !== JSON.stringify(integrationsExisting)) {
    out.integrations = integrationsNext;
  }

  const fundingNext = {
    round: state.fundingRound.trim() || undefined,
    amountUsd: state.fundingAmount ?? undefined,
    leadInvestor: state.fundingLeadInvestor.trim() || undefined,
  };
  const fundingExisting = {
    round: existing?.funding?.round || undefined,
    amountUsd: existing?.funding?.amountUsd ?? undefined,
    leadInvestor: existing?.funding?.leadInvestor || undefined,
  };
  if (JSON.stringify(fundingNext) !== JSON.stringify(fundingExisting)) {
    const allEmpty =
      !fundingNext.round && !fundingNext.amountUsd && !fundingNext.leadInvestor;
    out.funding = allEmpty ? undefined : fundingNext;
  }

  return Object.keys(out).length === 0 ? null : out;
}

export function DashboardEditClient({ slug }: { slug: string }) {
  const t = useTranslations("Dashboard");
  const tEdit = useTranslations("Dashboard.edit");
  const tTax = useTranslations("Taxonomy");

  const result = useQuery(api.companyDashboard.myCompanyBySlug, { slug });
  const updateMyCompany = useMutation(api.companyDashboard.updateMyCompany);

  const [state, setState] = useState<FormState | null>(null);
  const [hydratedFor, setHydratedFor] = useState<Id<"companies"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydrate local form state from the live doc. Set-during-render pattern
  // (React docs: "You might not need an effect") — guarded by `hydratedFor`
  // so we only re-seed when the doc identity actually changes.
  if (result && hydratedFor !== result.company._id) {
    setHydratedFor(result.company._id);
    setState(rowToFormState(result.company));
  }

  if (result === undefined) {
    return <Text className="text-muted-fg">{t("loading")}</Text>;
  }
  if (result === null) {
    return <NotFound />;
  }
  if (state === null) {
    return <Text className="text-muted-fg">{t("loading")}</Text>;
  }

  const { company, mode } = result;
  const patch = buildPatch(state, company);
  const dirty = Object.keys(patch).length > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyCompany({ companyId: company._id, patch });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <TextLink href="/dashboard">{tEdit("backToList")}</TextLink>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Heading level={1} className="text-3xl tracking-tight">
          {company.name}
        </Heading>
        <Badge intent={company.status === "published" ? "success" : "warning"}>
          {t(`status.${company.status}`)}
        </Badge>
      </div>

      {mode === "admin" ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <ShieldCheckIcon
            className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
            aria-hidden
          />
          <div className="flex flex-col gap-1">
            <Text className="text-sm font-medium text-amber-900 dark:text-amber-100">
              {tEdit("adminBannerHeading")}
            </Text>
            <Text className="text-xs text-amber-800 dark:text-amber-200">
              {tEdit("adminBannerBody")}
            </Text>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-8">
        <DashboardSectionNav />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
        <Form onSubmit={onSubmit} className="flex flex-col gap-6">
        <section id="about" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>{tEdit("fieldName")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <TextField
              value={state.name}
              onChange={(name) => setState({ ...state, name })}
              isRequired
            >
              <Label>{tEdit("fieldName")}</Label>
              <Input />
            </TextField>

            <div className="flex flex-col gap-2">
              <Label htmlFor="dashboard-description">{tEdit("fieldDescription")}</Label>
              <Textarea
                id="dashboard-description"
                value={state.description}
                onChange={(e) =>
                  setState({ ...state, description: e.currentTarget.value })
                }
                rows={4}
              />
              <Description>{tEdit("fieldDescriptionHint")}</Description>
            </div>

            <TextField
              value={state.website}
              onChange={(website) => setState({ ...state, website })}
              type="url"
            >
              <Label>{tEdit("fieldWebsite")}</Label>
              <Input placeholder="https://" />
            </TextField>

            <TextField
              value={state.linkedin}
              onChange={(linkedin) => setState({ ...state, linkedin })}
              type="url"
            >
              <Label>{tEdit("fieldLinkedin")}</Label>
              <Input placeholder="https://www.linkedin.com/company/…" />
            </TextField>
          </CardContent>
        </Card>
        </section>

        <section id="classification" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>{tEdit("fieldSector")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Select
              selectedKey={state.sector}
              onSelectionChange={(key) =>
                setState({ ...state, sector: key as SectorId })
              }
            >
              <Label>{tEdit("fieldSector")}</Label>
              <SelectTrigger />
              <SelectContent>
                {SECTOR_IDS.map((id) => (
                  <SelectItem key={id} id={id} textValue={tTax(`sectors.${id}`)}>
                    {tTax(`sectors.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              selectedKey={state.stage === "" ? null : state.stage}
              onSelectionChange={(key) =>
                setState({
                  ...state,
                  stage: key == null ? "" : (key as StageId),
                })
              }
            >
              <Label>{tEdit("fieldStage")}</Label>
              <SelectTrigger />
              <SelectContent>
                {STAGE_IDS.map((id) => (
                  <SelectItem key={id} id={id} textValue={tTax(`stages.${id}`)}>
                    {tTax(`stages.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              selectedKey={state.employeeCount === "" ? null : state.employeeCount}
              onSelectionChange={(key) =>
                setState({
                  ...state,
                  employeeCount: key == null ? "" : (key as EmployeeCountId),
                })
              }
            >
              <Label>{tEdit("fieldEmployeeCount")}</Label>
              <SelectTrigger />
              <SelectContent>
                {EMPLOYEE_COUNT_IDS.map((id) => (
                  <SelectItem
                    key={id}
                    id={id}
                    textValue={tTax(`employeeCounts.${id}`)}
                  >
                    {tTax(`employeeCounts.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <NumberField
              value={state.yearFounded ?? NaN}
              onChange={(yearFounded) =>
                setState({
                  ...state,
                  yearFounded: Number.isFinite(yearFounded) ? yearFounded : null,
                })
              }
              minValue={1800}
              maxValue={new Date().getFullYear()}
              formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
            >
              <Label>{tEdit("fieldYearFounded")}</Label>
              <Input />
            </NumberField>
          </CardContent>
        </Card>
        </section>

        <section id="hiring" className="scroll-mt-20">
        <Card>
          <CardHeader>
            <CardTitle>{tEdit("fieldHiringStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              selectedKey={state.hiring}
              onSelectionChange={(key) =>
                setState({ ...state, hiring: key as HiringSelectKey })
              }
            >
              <Label>{tEdit("fieldHiringStatus")}</Label>
              <SelectTrigger />
              <SelectContent>
                <SelectItem id="yes" textValue={tEdit("hiringTrue")}>
                  {tEdit("hiringTrue")}
                </SelectItem>
                <SelectItem id="no" textValue={tEdit("hiringFalse")}>
                  {tEdit("hiringFalse")}
                </SelectItem>
                <SelectItem id="unknown" textValue={tEdit("hiringUnknown")}>
                  {tEdit("hiringUnknown")}
                </SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        </section>

        <section id="brief" className="scroll-mt-20">
        <DashboardInvestorBriefSection
          state={state.brief}
          onChange={(brief) => setState({ ...state, brief })}
        />
        </section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg/90 p-3 backdrop-blur">
          <Button type="submit" intent="primary" isDisabled={!dirty || saving}>
            {saving ? tEdit("saving") : tEdit("saveAction")}
          </Button>
          {!dirty && savedAt === null ? (
            <Text className="text-muted-fg text-sm">{tEdit("noChanges")}</Text>
          ) : null}
          {savedAt !== null && !dirty ? (
            <Text className="text-muted-fg text-sm">
              {tEdit("savedAt", {
                time: new Date(savedAt).toLocaleTimeString(),
              })}
            </Text>
          ) : null}
          {error ? (
            <Text className="text-danger-subtle-fg text-sm">
              {tEdit("saveError", { message: error })}
            </Text>
          ) : null}
        </div>
      </Form>

      {/* Location sits outside the bulk-save form because re-geocoding
          is an HTTP call we only want on actual address changes, and
          its own save UI surfaces geocode-failed warnings inline. */}
      <section id="location" className="scroll-mt-20">
        <DashboardLocationSection company={company} />
      </section>

      {/* Photos has its own upload + delete mutations, no shared form
          state. Lives between brief and listings since it's also
          public-facing content. */}
      <section id="photos" className="scroll-mt-20">
        <DashboardPhotosSection companyId={company._id} />
      </section>

      {/* Listings has its own state + save action so an in-progress
          listing edit doesn't entangle with the company-info form. */}
      <section id="listings" className="scroll-mt-20">
        <DashboardListingsSection companyId={company._id} />
      </section>

      <section id="history" className="scroll-mt-20">
        <DashboardHistorySection companyId={company._id} />
      </section>
        </div>
      </div>
    </div>
  );
}

function NotFound() {
  const t = useTranslations("Dashboard.notFound");
  return (
    <Card className="bg-muted/30">
      <CardContent className="flex flex-col items-start gap-4 py-10">
        <Heading level={2} className="text-xl tracking-tight">
          {t("heading")}
        </Heading>
        <Text className="text-muted-fg max-w-xl">{t("body")}</Text>
        <TextLink href="/dashboard">{t("back")}</TextLink>
      </CardContent>
    </Card>
  );
}
