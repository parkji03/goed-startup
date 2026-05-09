"use client";

import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Form } from "react-aria-components";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Description, Label } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Text, TextLink } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { SECTOR_IDS, type SectorId } from "@/lib/companies/taxonomy";

type FormState = {
  name: string;
  website: string;
  description: string;
  sectorRaw: SectorId | "";
  locationRaw: string;
  submitterName: string;
  submitterEmail: string;
  submitterRole: string;
  notes: string;
};

const initialState: FormState = {
  name: "",
  website: "",
  description: "",
  sectorRaw: "",
  locationRaw: "",
  submitterName: "",
  submitterEmail: "",
  submitterRole: "",
  notes: "",
};

export function RegisterForm() {
  const t = useTranslations("RegisterCompany");
  const tTax = useTranslations("Taxonomy");
  const submitRegistration = useMutation(api.companyOnboarding.submitRegistration);

  const [state, setState] = useState<FormState>(initialState);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitRegistration({
        name: state.name,
        website: state.website || undefined,
        description: state.description,
        sectorRaw: state.sectorRaw || undefined,
        locationRaw: state.locationRaw,
        submitterName: state.submitterName,
        submitterEmail: state.submitterEmail,
        submitterRole: state.submitterRole || undefined,
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
          <Text className="text-muted-fg max-w-xl">{t("successBody")}</Text>
          <TextLink href="/map">{t("backToMap")}</TextLink>
        </CardContent>
      </Card>
    );
  }

  return (
    <Form onSubmit={onSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <TextField
            value={state.name}
            onChange={(name) => setState({ ...state, name })}
            isRequired
          >
            <Label>{t("fieldName")}</Label>
            <Input />
          </TextField>

          <TextField
            value={state.website}
            onChange={(website) => setState({ ...state, website })}
            type="url"
          >
            <Label>{t("fieldWebsite")}</Label>
            <Input placeholder="https://" />
            <Description>{t("fieldWebsiteHint")}</Description>
          </TextField>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-description">{t("fieldDescription")}</Label>
            <Textarea
              id="register-description"
              value={state.description}
              onChange={(e) =>
                setState({ ...state, description: e.currentTarget.value })
              }
              rows={4}
              required
            />
            <Description>{t("fieldDescriptionHint")}</Description>
          </div>

          <Select
            selectedKey={state.sectorRaw === "" ? null : state.sectorRaw}
            onSelectionChange={(key) =>
              setState({
                ...state,
                sectorRaw: key == null ? "" : (key as SectorId),
              })
            }
          >
            <Label>{t("fieldSector")}</Label>
            <SelectTrigger />
            <SelectContent>
              {SECTOR_IDS.map((id) => (
                <SelectItem key={id} id={id} textValue={tTax(`sectors.${id}`)}>
                  {tTax(`sectors.${id}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TextField
            value={state.locationRaw}
            onChange={(locationRaw) => setState({ ...state, locationRaw })}
            isRequired
          >
            <Label>{t("fieldLocation")}</Label>
            <Input placeholder={t("fieldLocationPlaceholder")} />
            <Description>{t("fieldLocationHint")}</Description>
          </TextField>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-6 pt-6">
          <Heading level={2} className="text-lg tracking-tight">
            {t("aboutYouHeading")}
          </Heading>

          <TextField
            value={state.submitterName}
            onChange={(submitterName) => setState({ ...state, submitterName })}
            isRequired
          >
            <Label>{t("fieldSubmitterName")}</Label>
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
            <Label>{t("fieldSubmitterEmail")}</Label>
            <Input />
            <Description>{t("fieldSubmitterEmailHint")}</Description>
          </TextField>

          <TextField
            value={state.submitterRole}
            onChange={(submitterRole) => setState({ ...state, submitterRole })}
          >
            <Label>{t("fieldSubmitterRole")}</Label>
            <Input placeholder={t("fieldSubmitterRolePlaceholder")} />
          </TextField>

          <div className="flex flex-col gap-2">
            <Label htmlFor="register-notes">{t("fieldNotes")}</Label>
            <Textarea
              id="register-notes"
              value={state.notes}
              onChange={(e) =>
                setState({ ...state, notes: e.currentTarget.value })
              }
              rows={3}
            />
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
  );
}
