"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Form } from "react-aria-components";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Description, Label } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Text, TextLink } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";

type FormState = {
  submitterName: string;
  submitterEmail: string;
  submitterRole: string;
  notes: string;
};

const initialState: FormState = {
  submitterName: "",
  submitterEmail: "",
  submitterRole: "",
  notes: "",
};

export function ClaimForm({ slug }: { slug: string }) {
  const t = useTranslations("ClaimCompany");
  const tTax = useTranslations("Taxonomy");
  const company = useQuery(api.companyOnboarding.claimablePreviewBySlug, { slug });
  const submitClaim = useMutation(api.companyOnboarding.submitClaim);

  const [state, setState] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (company === undefined) {
    return <Text className="text-muted-fg">{t("loading")}</Text>;
  }

  if (company === null) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col items-start gap-4 py-10">
          <Heading level={2} className="text-xl tracking-tight">
            {t("notFoundHeading")}
          </Heading>
          <Text className="text-muted-fg max-w-xl">{t("notFoundBody")}</Text>
          <TextLink href="/map">{t("backToMap")}</TextLink>
        </CardContent>
      </Card>
    );
  }

  if (company.isClaimed && !submitted) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col items-start gap-4 py-10">
          <Heading level={2} className="text-xl tracking-tight">
            {t("alreadyClaimedHeading")}
          </Heading>
          <Text className="text-muted-fg max-w-xl">
            {t("alreadyClaimedBody", { name: company.name })}
          </Text>
          <TextLink href="/map">{t("backToMap")}</TextLink>
        </CardContent>
      </Card>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitClaim({
        slug,
        submitterName: state.submitterName,
        submitterEmail: state.submitterEmail,
        submitterRole: state.submitterRole,
        notes: state.notes || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="flex flex-col items-start gap-4 py-10">
          <Heading level={2} className="text-xl tracking-tight">
            {t("successHeading")}
          </Heading>
          <Text className="text-muted-fg max-w-xl">
            {t("successBody", { name: company.name })}
          </Text>
          <TextLink href="/map">{t("backToMap")}</TextLink>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Heading level={1} className="text-3xl tracking-tight">
          {t("heading", { name: company.name })}
        </Heading>
        <Text className="text-muted-fg">
          {t("blurb", { sector: tTax(`sectors.${company.sector}`) })}
        </Text>
      </div>

      <Form onSubmit={onSubmit} className="flex flex-col gap-6">
        <Card>
          <CardContent className="flex flex-col gap-6 pt-6">
            <TextField
              value={state.submitterName}
              onChange={(submitterName) =>
                setState({ ...state, submitterName })
              }
              isRequired
            >
              <Label>{t("fieldName")}</Label>
              <Input />
            </TextField>

            <TextField
              value={state.submitterEmail}
              onChange={(submitterEmail) =>
                setState({ ...state, submitterEmail })
              }
              type="email"
              isRequired
            >
              <Label>{t("fieldEmail")}</Label>
              <Input />
              <Description>
                {company.website
                  ? t("fieldEmailHintWithDomain", {
                      domain: domainFromUrlLoose(company.website) ?? "your company",
                    })
                  : t("fieldEmailHint")}
              </Description>
            </TextField>

            <TextField
              value={state.submitterRole}
              onChange={(submitterRole) =>
                setState({ ...state, submitterRole })
              }
              isRequired
            >
              <Label>{t("fieldRole")}</Label>
              <Input placeholder={t("fieldRolePlaceholder")} />
            </TextField>

            <div className="flex flex-col gap-2">
              <Label htmlFor="claim-notes">{t("fieldNotes")}</Label>
              <Textarea
                id="claim-notes"
                value={state.notes}
                onChange={(e) =>
                  setState({ ...state, notes: e.currentTarget.value })
                }
                rows={3}
              />
              <Description>{t("fieldNotesHint")}</Description>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" intent="primary" isDisabled={submitting}>
            {submitting ? t("submitting") : t("submit")}
          </Button>
          {error ? (
            <Text className="text-danger-subtle-fg text-sm">{error}</Text>
          ) : null}
        </div>
      </Form>
    </div>
  );
}

/** Best-effort domain extraction for the email-hint copy only. Returns
 * `null` if the website doesn't parse — the form falls back to a generic
 * hint in that case. */
function domainFromUrlLoose(website: string | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}
