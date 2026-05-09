"use client";

import { TrashIcon } from "@heroicons/react/20/solid";
import { useTranslations } from "next-intl";

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
import { TagField } from "@/components/ui/tag-field";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";

const TARGET_MARKET_IDS = [
  "enterprise",
  "mid-market",
  "smb",
  "consumer",
  "developer",
  "prosumer",
] as const;

const MONETIZATION_IDS = [
  "subscription",
  "usage-based",
  "marketplace",
  "transactional",
  "freemium",
  "contact-sales",
  "ads",
] as const;

export type TargetMarketId = (typeof TARGET_MARKET_IDS)[number];
export type MonetizationModelId = (typeof MONETIZATION_IDS)[number];

export type FounderEntry = {
  name: string;
  title: string;
  priorCompanies: string[];
};

export type KeyMetricEntry = {
  metric: string;
  value: string;
};

export type InvestorBriefFormState = {
  pitch: string;
  productCategory: string;
  targetMarket: TargetMarketId | "";
  monetizationModel: MonetizationModelId | "";
  openRoleCount: number | null;
  differentiationClaim: string;
  founders: FounderEntry[];
  notableCustomers: string[];
  keyMetrics: KeyMetricEntry[];
  integrations: string[];
  fundingRound: string;
  fundingAmount: number | null;
  fundingLeadInvestor: string;
};

export const emptyBriefState: InvestorBriefFormState = {
  pitch: "",
  productCategory: "",
  targetMarket: "",
  monetizationModel: "",
  openRoleCount: null,
  differentiationClaim: "",
  founders: [],
  notableCustomers: [],
  keyMetrics: [],
  integrations: [],
  fundingRound: "",
  fundingAmount: null,
  fundingLeadInvestor: "",
};

type Props = {
  state: InvestorBriefFormState;
  onChange: (next: InvestorBriefFormState) => void;
};

export function DashboardInvestorBriefSection({ state, onChange }: Props) {
  const t = useTranslations("Dashboard.brief");
  const tTax = useTranslations("Taxonomy");

  const set = <K extends keyof InvestorBriefFormState>(
    key: K,
    value: InvestorBriefFormState[K],
  ) => onChange({ ...state, [key]: value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <Description>{t("subtitle")}</Description>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Label htmlFor="brief-pitch">{t("pitch")}</Label>
          <Textarea
            id="brief-pitch"
            value={state.pitch}
            onChange={(e) => set("pitch", e.currentTarget.value)}
            rows={3}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <TextField
            value={state.productCategory}
            onChange={(productCategory) => set("productCategory", productCategory)}
          >
            <Label>{t("productCategory")}</Label>
            <Input placeholder={t("productCategoryPlaceholder")} />
          </TextField>

          <NumberField
            value={state.openRoleCount ?? NaN}
            onChange={(n) =>
              set("openRoleCount", Number.isFinite(n) ? n : null)
            }
            minValue={0}
            formatOptions={{ useGrouping: false, maximumFractionDigits: 0 }}
          >
            <Label>{t("openRoleCount")}</Label>
            <Input />
          </NumberField>

          <Select
            selectedKey={state.targetMarket === "" ? null : state.targetMarket}
            onSelectionChange={(key) =>
              set(
                "targetMarket",
                key == null ? "" : (key as TargetMarketId),
              )
            }
          >
            <Label>{t("targetMarket")}</Label>
            <SelectTrigger />
            <SelectContent>
              {TARGET_MARKET_IDS.map((id) => (
                <SelectItem
                  key={id}
                  id={id}
                  textValue={tTax(`targetMarkets.${id}`)}
                >
                  {tTax(`targetMarkets.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            selectedKey={
              state.monetizationModel === "" ? null : state.monetizationModel
            }
            onSelectionChange={(key) =>
              set(
                "monetizationModel",
                key == null ? "" : (key as MonetizationModelId),
              )
            }
          >
            <Label>{t("monetizationModel")}</Label>
            <SelectTrigger />
            <SelectContent>
              {MONETIZATION_IDS.map((id) => (
                <SelectItem
                  key={id}
                  id={id}
                  textValue={tTax(`monetizationModels.${id}`)}
                >
                  {tTax(`monetizationModels.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="brief-differentiation">
            {t("differentiationClaim")}
          </Label>
          <Textarea
            id="brief-differentiation"
            value={state.differentiationClaim}
            onChange={(e) => set("differentiationClaim", e.currentTarget.value)}
            rows={2}
          />
          <Description>{t("differentiationHint")}</Description>
        </div>

        <FoundersField
          founders={state.founders}
          onChange={(founders) => set("founders", founders)}
        />

        <div className="flex flex-col gap-2">
          <Label>{t("notableCustomers")}</Label>
          <TagField
            // Re-key on the size of the underlying list so a programmatic
            // reset (e.g. revert) re-mounts the input with the new defaults.
            key={`customers-${state.notableCustomers.length}`}
            defaultValue={state.notableCustomers}
            onChange={(sel) =>
              set(
                "notableCustomers",
                sel === "all" ? [] : Array.from(sel).map(String),
              )
            }
            aria-label={t("notableCustomers")}
          />
          <Description>{t("notableCustomersHint")}</Description>
        </div>

        <KeyMetricsField
          metrics={state.keyMetrics}
          onChange={(keyMetrics) => set("keyMetrics", keyMetrics)}
        />

        <div className="flex flex-col gap-2">
          <Label>{t("integrations")}</Label>
          <TagField
            key={`integrations-${state.integrations.length}`}
            defaultValue={state.integrations}
            onChange={(sel) =>
              set(
                "integrations",
                sel === "all" ? [] : Array.from(sel).map(String),
              )
            }
            aria-label={t("integrations")}
          />
          <Description>{t("integrationsHint")}</Description>
        </div>

        <div className="flex flex-col gap-3">
          <Heading level={3} className="text-base font-semibold">
            {t("fundingHeading")}
          </Heading>
          <div className="grid gap-6 sm:grid-cols-3">
            <TextField
              value={state.fundingRound}
              onChange={(fundingRound) => set("fundingRound", fundingRound)}
            >
              <Label>{t("fundingRound")}</Label>
              <Input placeholder={t("fundingRoundPlaceholder")} />
            </TextField>
            <NumberField
              value={state.fundingAmount ?? NaN}
              onChange={(n) =>
                set("fundingAmount", Number.isFinite(n) ? n : null)
              }
              minValue={0}
              formatOptions={{
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              }}
            >
              <Label>{t("fundingAmount")}</Label>
              <Input />
            </NumberField>
            <TextField
              value={state.fundingLeadInvestor}
              onChange={(fundingLeadInvestor) =>
                set("fundingLeadInvestor", fundingLeadInvestor)
              }
            >
              <Label>{t("fundingLeadInvestor")}</Label>
              <Input />
            </TextField>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FoundersField({
  founders,
  onChange,
}: {
  founders: FounderEntry[];
  onChange: (next: FounderEntry[]) => void;
}) {
  const t = useTranslations("Dashboard.brief");
  const update = (i: number, patch: Partial<FounderEntry>) =>
    onChange(founders.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) =>
    onChange(founders.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([
      ...founders,
      { name: "", title: "", priorCompanies: [] },
    ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{t("founders")}</Label>
        <Button size="xs" intent="outline" onPress={add}>
          {t("addFounder")}
        </Button>
      </div>
      {founders.length === 0 ? (
        <Text className="text-muted-fg text-sm">{t("foundersEmpty")}</Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {founders.map((f, i) => (
            <li
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border p-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  value={f.name}
                  onChange={(name) => update(i, { name })}
                  isRequired
                >
                  <Label>{t("founderName")}</Label>
                  <Input />
                </TextField>
                <TextField
                  value={f.title}
                  onChange={(title) => update(i, { title })}
                >
                  <Label>{t("founderTitle")}</Label>
                  <Input />
                </TextField>
              </div>
              <div className="flex flex-col gap-2">
                <Label>{t("founderPriorCompanies")}</Label>
                <TagField
                  key={`prior-${i}-${f.priorCompanies.length}`}
                  defaultValue={f.priorCompanies}
                  onChange={(sel) =>
                    update(i, {
                      priorCompanies:
                        sel === "all" ? [] : Array.from(sel).map(String),
                    })
                  }
                  aria-label={t("founderPriorCompanies")}
                />
              </div>
              <div className="flex justify-end">
                <Button size="xs" intent="outline" onPress={() => remove(i)}>
                  <TrashIcon className="size-3.5" aria-hidden />
                  {t("removeFounder")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function KeyMetricsField({
  metrics,
  onChange,
}: {
  metrics: KeyMetricEntry[];
  onChange: (next: KeyMetricEntry[]) => void;
}) {
  const t = useTranslations("Dashboard.brief");
  const update = (i: number, patch: Partial<KeyMetricEntry>) =>
    onChange(metrics.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  const remove = (i: number) =>
    onChange(metrics.filter((_, idx) => idx !== i));
  const add = () => onChange([...metrics, { metric: "", value: "" }]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label>{t("keyMetrics")}</Label>
        <Button size="xs" intent="outline" onPress={add}>
          {t("addMetric")}
        </Button>
      </div>
      {metrics.length === 0 ? (
        <Text className="text-muted-fg text-sm">{t("keyMetricsEmpty")}</Text>
      ) : (
        <ul className="flex flex-col gap-3">
          {metrics.map((m, i) => (
            <li
              key={i}
              className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <TextField
                value={m.metric}
                onChange={(metric) => update(i, { metric })}
              >
                <Label>{t("metricLabel")}</Label>
                <Input placeholder="ARR" />
              </TextField>
              <TextField
                value={m.value}
                onChange={(value) => update(i, { value })}
              >
                <Label>{t("metricValue")}</Label>
                <Input placeholder="$10M" />
              </TextField>
              <div className="flex items-end">
                <Button
                  size="xs"
                  intent="outline"
                  onPress={() => remove(i)}
                  aria-label={t("removeMetric")}
                >
                  <TrashIcon className="size-3.5" aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
