"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

/** Copy for `listPendingForAdmin` when `access === "denied"`. */
function adminAccessBlockedMessage(reason: string): string {
  switch (reason) {
    case "signed_out":
      return "Convex does not see a signed-in user. Add JWT auth in convex/auth.config.ts (Clerk integration) so tokens from this app validate on the Convex deployment.";
    case "missing_email_in_token":
      return (
        "Your session has no email claim for Convex. In Clerk, finish the Convex integration so JWTs include your primary email."
      );
    case "not_configured":
      return "ADMIN_EMAILS is not set on this Convex deployment. Add it under Convex → Settings → Environment variables (comma-separated emails).";
    case "not_in_allowlist":
      return "Signed-in email is not in ADMIN_EMAILS. Add your Clerk primary email (lowercase) on the Convex deployment.";
    default:
      return `Admin access was denied (${reason}).`;
  }
}

export function AdminResourcesClient() {
  const queue = useQuery(api.resourceSubmissions.listPendingForAdmin);
  const approve = useMutation(api.resourceSubmissions.approve);
  const reject = useMutation(api.resourceSubmissions.reject);

  const [log, setLog] = useState<string>("");
  const [busyId, setBusyId] = useState<Id<"resourceSubmissions"> | null>(null);
  const [rejectNoteBySubmission, setRejectNoteBySubmission] = useState<Record<string, string>>({});

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
          Resource moderation
        </Heading>
        <Text className="text-muted-fg">
          Bulk directory data comes from CSV via <code className="text-xs">pnpm seed:resources</code>{" "}
          (<code className="text-xs">pnpm exec convex run resourceImport:importInternal</code> in
          batches; requires a linked Convex project). Growing the catalog afterward happens here by
          approving submissions — or via future inline create/edit in admin.
        </Text>
        <Text className="text-muted-fg text-sm">
          Access: Convex deployment variables{" "}
          <code className="text-xs">CLERK_FRONTEND_API_URL</code> (see convex/auth.config.ts +
          Convex/Clerk docs) and{" "}
          <code className="text-xs">ADMIN_EMAILS</code> including your Clerk user email.
        </Text>
        {log ? <Text className="text-sm text-danger-subtle-fg">{log}</Text> : null}
      </section>

      <section className="space-y-4">
        <Heading level={2} className="text-xl tracking-tight">
          Pending submissions
        </Heading>
        {queue === undefined ? (
          <Text className="text-muted-fg">Loading…</Text>
        ) : accessDeniedReason !== null ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
            <Text className="text-sm font-medium text-danger-subtle-fg">Cannot load admin inbox</Text>
            <Text className="text-muted-fg text-sm">{adminAccessBlockedMessage(accessDeniedReason)}</Text>
            <Text className="text-muted-fg text-xs">
              Convex dashboard → set <code className="text-xs">CLERK_FRONTEND_API_URL</code> +
              <code className="text-xs"> ADMIN_EMAILS</code> → run{" "}
              <code className="text-xs">pnpm exec convex dev</code>; open this admin route signed in as a
              user whose email is in ADMIN_EMAILS.
            </Text>
          </div>
        ) : pendingList !== null && pendingList.length === 0 ? (
          <Text className="text-muted-fg text-sm">Inbox Zero 🎉</Text>
        ) : pendingList !== null ? (
          <ul className="space-y-3">
            {pendingList.map((s) => (
              <li key={s._id} className="rounded-xl border border-border p-4">
                <Heading level={3} className="text-lg">
                  {s.title}
                </Heading>
                <Text className="text-muted-fg text-sm">{s.url}</Text>
                <label className="mt-3 block font-medium text-fg text-sm" htmlFor={`reject-note-${s._id}`}>
                  Rejection note (shown in audit trail)
                </label>
                <textarea
                  id={`reject-note-${s._id}`}
                  placeholder="Brief reason…"
                  className="border-input mt-1 min-h-20 w-full max-w-xl rounded-lg border bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
                  value={rejectNoteBySubmission[s._id] ?? ""}
                  onChange={(e) =>
                    setRejectNoteBySubmission((prev) => ({ ...prev, [s._id]: e.target.value }))
                  }
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    intent="primary"
                    isDisabled={busyId !== null}
                    onPress={() =>
                      void (async () => {
                        setBusyId(s._id);
                        setLog("");
                        try {
                          await approve({ submissionId: s._id });
                        } catch (err) {
                          setLog(err instanceof Error ? err.message : String(err));
                        } finally {
                          setBusyId(null);
                        }
                      })()
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    intent="danger"
                    isDisabled={busyId !== null}
                    onPress={() =>
                      void (async () => {
                        setBusyId(s._id);
                        setLog("");
                        const reason = rejectNoteBySubmission[s._id]?.trim() ?? "";
                        if (!reason) {
                          setLog("Add a rejection note before rejecting.");
                          setBusyId(null);
                          return;
                        }
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
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
