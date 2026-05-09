"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import {
  resourceSubmitSchema,
  splitSuggestedTags,
  type ResourceSubmitValues,
} from "@/lib/forms/resource-submit";
import { RESOURCE_CATEGORIES } from "@/lib/resources/categories";

export function ResourceSubmitForm() {
  const t = useTranslations("Resources.submitForm");
  const tFields = useTranslations("Resources.submitForm.fields");
  const tCat = useTranslations("Taxonomy.resourceCategories");
  const submit = useMutation(api.resourceSubmissions.submit);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ResourceSubmitValues>({
    resolver: zodResolver(resourceSubmitSchema),
    defaultValues: {
      title: "",
      description: "",
      url: "",
      submitterName: "",
      submitterEmail: "",
      organization: "",
      category: undefined as unknown as ResourceSubmitValues["category"],
      tags: "",
      notes: "",
    },
  });

  async function onSubmit(values: ResourceSubmitValues) {
    setSubmitError("");
    try {
      await submit({
        title: values.title,
        description: values.description,
        url: values.url,
        submitterName: values.submitterName,
        submitterEmail: values.submitterEmail,
        organization: values.organization?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        suggestedCategory: values.category,
        suggestedCommunities: [],
        suggestedIndustries: [],
        suggestedLocations: [],
        suggestedTopics: [],
        suggestedTags: splitSuggestedTags(values.tags),
      });
      setDone(true);
      reset();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    }
  }

  const busy = isSubmitting;

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Heading level={1} className="text-3xl tracking-tight">
        {t("heading")}
      </Heading>
      <Text className="mt-3 text-muted-fg">
        {t("intro")}
      </Text>
      {submitError ? (
        <Text className="text-danger-subtle-fg mt-6 text-sm">{submitError}</Text>
      ) : null}
      {done ? (
        <Text className="mt-8 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          {t("thanks")}
        </Text>
      ) : (
        <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div>
            <label htmlFor="title" className="font-medium text-fg text-sm">
              {tFields("title")}
            </label>
            <Controller
              name="title"
              control={control}
              render={({ field }) => <Input {...field} id="title" className="mt-1" />}
            />
            {errors.title?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.title.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="description" className="font-medium text-fg text-sm">
              {tFields("description")}
            </label>
            <Controller
              name="description"
              control={control}
              render={({ field }) => (
                <textarea
                  id="description"
                  className="mt-1 min-h-28 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-hidden focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20 invalid:border-danger-subtle-fg/70"
                  {...field}
                />
              )}
            />
            {errors.description?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.description.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="url" className="font-medium text-fg text-sm">
              {tFields("url")}
            </label>
            <Controller
              name="url"
              control={control}
              render={({ field }) => <Input {...field} id="url" type="url" className="mt-1" />}
            />
            {errors.url?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.url.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="submitterName" className="font-medium text-fg text-sm">
              {tFields("submitterName")}
            </label>
            <Controller
              name="submitterName"
              control={control}
              render={({ field }) => <Input {...field} id="submitterName" className="mt-1" />}
            />
            {errors.submitterName?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.submitterName.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="submitterEmail" className="font-medium text-fg text-sm">
              {tFields("submitterEmail")}
            </label>
            <Controller
              name="submitterEmail"
              control={control}
              render={({ field }) => (
                <Input {...field} id="submitterEmail" type="email" className="mt-1" />
              )}
            />
            {errors.submitterEmail?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.submitterEmail.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="organization" className="font-medium text-fg text-sm">
              {tFields("organization")}
            </label>
            <Controller
              name="organization"
              control={control}
              render={({ field }) => <Input {...field} id="organization" className="mt-1" />}
            />
            {errors.organization?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.organization.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="category" className="font-medium text-fg text-sm">
              {tFields("category")}
            </label>
            <Controller
              name="category"
              control={control}
              render={({ field }) => (
                <Select
                  className="mt-1"
                  placeholder={tFields("categoryPlaceholder")}
                  selectedKey={field.value ?? null}
                  onSelectionChange={(key) => field.onChange(key)}
                >
                  <SelectTrigger />
                  <SelectContent items={RESOURCE_CATEGORIES}>
                    {(c) => {
                      const label = tCat(`${c.key}.label`);
                      return (
                        <SelectItem id={c.key} textValue={label}>
                          {label}
                        </SelectItem>
                      );
                    }}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.category.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="tags" className="font-medium text-fg text-sm">
              {tFields("tags")}
            </label>
            <Controller
              name="tags"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  id="tags"
                  className="mt-1"
                  placeholder={tFields("tagsPlaceholder")}
                />
              )}
            />
            {errors.tags?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.tags.message}</Text>
            ) : null}
          </div>
          <div>
            <label htmlFor="notes" className="font-medium text-fg text-sm">
              {tFields("notes")}
            </label>
            <Controller
              name="notes"
              control={control}
              render={({ field }) => (
                <textarea
                  id="notes"
                  className="mt-1 min-h-24 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-hidden focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
                  {...field}
                />
              )}
            />
            {errors.notes?.message ? (
              <Text className="text-danger-subtle-fg mt-1 text-sm">{errors.notes.message}</Text>
            ) : null}
          </div>
          <Button type="submit" intent="primary" isDisabled={busy}>
            {busy ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
