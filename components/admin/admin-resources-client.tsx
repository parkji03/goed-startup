"use client";

import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Selection } from "react-aria-components";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { TagField } from "@/components/ui/tag-field";
import { Text } from "@/components/ui/text";
import { RESOURCE_CATEGORIES, type ResourceCategoryKey } from "@/lib/resources/categories";

const KNOWN_ACCESS_DENIAL_REASONS = new Set([
  "signed_out",
  "missing_email_in_token",
  "not_configured",
  "not_in_allowlist",
]);

function selectionToStrings(s: Selection): string[] {
  return s === "all" ? [] : Array.from(s).map((k) => String(k));
}

type Override = {
  category: ResourceCategoryKey | null;
  tags: string[];
  communities: string[];
  stageTags: string[];
};

export function AdminResourcesClient() {
  const t = useTranslations("AdminResources");
  const tDenied = useTranslations("AdminResources.accessDenied");
  const tCat = useTranslations("Taxonomy.resourceCategories");
  const queue = useQuery(api.resourceSubmissions.listPendingForAdmin);
  const approve = useMutation(api.resourceSubmissions.approve);
  const reject = useMutation(api.resourceSubmissions.reject);

  const [log, setLog] = useState<string>("");
  const [busyId, setBusyId] = useState<Id<"resourceSubmissions"> | null>(null);
  const [rejectNoteBySubmission, setRejectNoteBySubmission] = useState<Record<string, string>>({});
  const [overridesBySubmission, setOverridesBySubmission] = useState<Record<string, Override>>({});

  function adminAccessBlockedMessage(reason: string): string {
    if (KNOWN_ACCESS_DENIAL_REASONS.has(reason)) {
      return tDenied(reason);
    }
    return tDenied("other", { reason });
  }

  let pendingList: Doc<"resourceSubmissions">[] | null = null;
  let accessDeniedReason: string | null = null;
  if (queue !== undefined) {
    if (queue.access === "denied") {
      accessDeniedReason = queue.reason;
    } else {
      pendingList = queue.submissions;
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-12">
      <section className="space-y-4">
        <Heading level={1} className="text-3xl tracking-tight">
          {t("heading")}
        </Heading>
        <Text className="text-muted-fg">
          {t.rich("intro", {
            seedCmd: () => <code className="text-xs">pnpm seed:resources</code>,
            importCmd: () => (
              <code className="text-xs">pnpm exec convex run resourceImport:importInternal</code>
            ),
          })}
        </Text>
        <Text className="text-muted-fg text-sm">
          {t.rich("access", {
            clerkVar: () => <code className="text-xs">CLERK_FRONTEND_API_URL</code>,
            adminEmailsVar: () => <code className="text-xs">ADMIN_EMAILS</code>,
          })}
        </Text>
        {log ? <Text className="text-sm text-danger-subtle-fg">{log}</Text> : null}
      </section>

      <section className="space-y-4">
        <Heading level={2} className="text-xl tracking-tight">
          {t("pendingHeading")}
        </Heading>
        {queue === undefined ? (
          <Text className="text-muted-fg">{t("loading")}</Text>
        ) : accessDeniedReason !== null ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
            <Text className="text-sm font-medium text-danger-subtle-fg">
              {t("cannotLoad")}
            </Text>
            <Text className="text-muted-fg text-sm">
              {adminAccessBlockedMessage(accessDeniedReason)}
            </Text>
            <Text className="text-muted-fg text-xs">
              {t.rich("convexHint", {
                clerkVar: () => <code className="text-xs">CLERK_FRONTEND_API_URL</code>,
                adminEmailsVar: () => <code className="text-xs">ADMIN_EMAILS</code>,
                devCmd: () => <code className="text-xs">pnpm exec convex dev</code>,
              })}
            </Text>
          </div>
        ) : pendingList !== null && pendingList.length === 0 ? (
          <Text className="text-muted-fg text-sm">{t("inboxZero")}</Text>
        ) : pendingList !== null ? (
          <ul className="space-y-3">
            {pendingList.map((s) => {
              const o: Override =
                overridesBySubmission[s._id] ?? {
                  category: s.suggestedCategory ?? null,
                  tags: s.suggestedTags ?? [],
                  communities: s.suggestedCommunities,
                  stageTags: [],
                };
              const setO = (patch: Partial<Override>) =>
                setOverridesBySubmission((prev) => ({
                  ...prev,
                  [s._id]: { ...o, ...patch },
                }));

              return (
                <li key={s._id} className="space-y-4 rounded-xl border border-border p-4">
                  <div>
                    <Heading level={3} className="text-lg">
                      {s.title}
                    </Heading>
                    <Text className="text-muted-fg text-sm">{s.url}</Text>
                    <Text className="mt-2 text-sm">{s.description}</Text>
                    <Text className="text-muted-fg mt-1 text-xs">
                      {s.organization
                        ? t("submittedByWithOrg", {
                            name: s.submitterName,
                            email: s.submitterEmail,
                            organization: s.organization,
                          })
                        : t("submittedBy", {
                            name: s.submitterName,
                            email: s.submitterEmail,
                          })}
                    </Text>
                    {s.notes ? (
                      <Text className="mt-1 text-xs italic">{t("notes", { notes: s.notes })}</Text>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="font-medium text-fg text-sm">{t("labels.category")}</label>
                      <Select
                        className="mt-1"
                        placeholder={t("labels.categoryPlaceholder")}
                        selectedKey={o.category}
                        onSelectionChange={(k) =>
                          setO({ category: k as ResourceCategoryKey })
                        }
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
                    </div>
                    <div>
                      <label className="font-medium text-fg text-sm">{t("labels.tags")}</label>
                      <TagField
                        className="mt-1"
                        defaultValue={o.tags}
                        onChange={(sel) => setO({ tags: selectionToStrings(sel) })}
                      />
                    </div>
                    <div>
                      <label className="font-medium text-fg text-sm">{t("labels.communities")}</label>
                      <TagField
                        className="mt-1"
                        defaultValue={o.communities}
                        onChange={(sel) =>
                          setO({ communities: selectionToStrings(sel) })
                        }
                      />
                    </div>
                    <div>
                      <label className="font-medium text-fg text-sm">{t("labels.stageTags")}</label>
                      <TagField
                        className="mt-1"
                        defaultValue={o.stageTags}
                        onChange={(sel) => setO({ stageTags: selectionToStrings(sel) })}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      className="block font-medium text-fg text-sm"
                      htmlFor={`reject-note-${s._id}`}
                    >
                      {t("labels.rejectionNote")}
                    </label>
                    <textarea
                      id={`reject-note-${s._id}`}
                      placeholder={t("labels.rejectionNotePlaceholder")}
                      className="border-input mt-1 min-h-20 w-full max-w-xl rounded-lg border bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
                      value={rejectNoteBySubmission[s._id] ?? ""}
                      onChange={(e) =>
                        setRejectNoteBySubmission((prev) => ({
                          ...prev,
                          [s._id]: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      intent="primary"
                      isDisabled={busyId !== null || !o.category}
                      onPress={() =>
                        void (async () => {
                          if (!o.category) return;
                          setBusyId(s._id);
                          setLog("");
                          try {
                            await approve({
                              submissionId: s._id,
                              category: o.category,
                              tags: o.tags,
                              communities: o.communities,
                              stageTags: o.stageTags,
                            });
                          } catch (err) {
                            setLog(err instanceof Error ? err.message : String(err));
                          } finally {
                            setBusyId(null);
                          }
                        })()
                      }
                    >
                      {t("actions.approve")}
                    </Button>
                    <Button
                      size="sm"
                      intent="danger"
                      isDisabled={busyId !== null}
                      onPress={() =>
                        void (async () => {
                          const reason = rejectNoteBySubmission[s._id]?.trim() ?? "";
                          if (!reason) {
                            setLog(t("actions.addRejectionNote"));
                            return;
                          }
                          setBusyId(s._id);
                          setLog("");
                          try {
                            await reject({ submissionId: s._id, reason });
                            setRejectNoteBySubmission((prev) => {
                              const next = { ...prev };
                              delete next[s._id];
                              return next;
                            });
                          } catch (err) {
                            setLog(err instanceof Error ? err.message : String(err));
                          } finally {
                            setBusyId(null);
                          }
                        })()
                      }
                    >
                      {t("actions.reject")}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
