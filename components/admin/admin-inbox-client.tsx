"use client";

import {
  ArrowTopRightOnSquareIcon,
  BuildingOffice2Icon,
  ShieldCheckIcon,
} from "@heroicons/react/20/solid";
import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

/** Copy for the admin-gate denied panel — same reason set as
 * `resourceSubmissions:listPendingForAdmin`. */
function adminAccessBlockedMessage(reason: string): string {
  switch (reason) {
    case "signed_out":
      return "Convex does not see a signed-in user. Add JWT auth in convex/auth.config.ts (Clerk integration) so tokens from this app validate on the Convex deployment.";
    case "missing_email_in_token":
      return "Your session has no email claim for Convex. In Clerk, finish the Convex integration so JWTs include your primary email.";
    case "not_configured":
      return "ADMIN_EMAILS is not set on this Convex deployment. Add it under Convex → Settings → Environment variables (comma-separated emails).";
    case "not_in_allowlist":
      return "Signed-in email is not in ADMIN_EMAILS. Add your Clerk primary email (lowercase) on the Convex deployment.";
    case "domain_not_allowed":
      return "Signed-in email's domain is not in ADMIN_EMAIL_DOMAINS. Add the domain on the Convex deployment.";
    default:
      return `Admin access was denied (${reason}).`;
  }
}

type ClaimRow = Doc<"companyClaimRequests"> & {
  company: {
    _id: Id<"companies">;
    name: string;
    slug: string;
    website?: string;
    isClaimed: boolean;
  } | null;
};

export function AdminInboxClient() {
  const claimsQuery = useQuery(api.companyOnboarding.listPendingClaimsForAdmin);
  const registrationsQuery = useQuery(
    api.companyOnboarding.listPendingRegistrationsForAdmin,
  );

  const accessDeniedReason =
    claimsQuery?.access === "denied"
      ? claimsQuery.reason
      : registrationsQuery?.access === "denied"
        ? registrationsQuery.reason
        : null;

  if (accessDeniedReason) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
        <Text className="text-sm font-medium text-danger-subtle-fg">
          Cannot load inbox
        </Text>
        <Text className="text-muted-fg text-sm">
          {adminAccessBlockedMessage(accessDeniedReason)}
        </Text>
      </div>
    );
  }

  const claims =
    claimsQuery?.access === "allowed" ? claimsQuery.claims : null;
  const registrations =
    registrationsQuery?.access === "allowed"
      ? registrationsQuery.submissions
      : null;

  return (
    <div className="space-y-10">
      <ClaimsSection claims={claims} />
      <RegistrationsSection registrations={registrations} />
    </div>
  );
}

function ClaimsSection({ claims }: { claims: ClaimRow[] | null }) {
  const approve = useMutation(api.companyOnboarding.approveClaim);
  const reject = useMutation(api.companyOnboarding.rejectClaim);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon aria-hidden className="size-5 text-muted-fg" />
        <Heading level={2} className="text-xl tracking-tight">
          Claim requests
        </Heading>
        {claims ? (
          <Text className="text-muted-fg text-sm">({claims.length})</Text>
        ) : null}
      </div>

      {claims === null ? (
        <Text className="text-muted-fg text-sm">Loading…</Text>
      ) : claims.length === 0 ? (
        <Text className="text-muted-fg text-sm">No pending claim requests.</Text>
      ) : (
        <ul className="space-y-3">
          {claims.map((c) => (
            <ClaimCard
              key={c._id}
              claim={c}
              onApprove={(note) =>
                approve({
                  claimRequestId: c._id,
                  moderatorNote: note || undefined,
                })
              }
              onReject={(reason) =>
                reject({ claimRequestId: c._id, reason })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ClaimCard({
  claim,
  onApprove,
  onReject,
}: {
  claim: ClaimRow;
  onApprove: (note: string) => Promise<unknown>;
  onReject: (reason: string) => Promise<unknown>;
}) {
  const [rejectNote, setRejectNote] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "approve" | "reject", fn: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const submitted = new Date(claim.createdAt).toLocaleString();
  const companyName = claim.company?.name ?? claim.companyNameSnapshot;
  const companySlug = claim.company?.slug;

  return (
    <li className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading level={3} className="text-lg">
            {companyName}
          </Heading>
          {companySlug ? (
            <a
              href={`/map?selected=${companySlug}`}
              className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-fg"
              target="_blank"
              rel="noopener noreferrer"
            >
              View on map
              <ArrowTopRightOnSquareIcon className="size-3" aria-hidden />
            </a>
          ) : (
            <Text className="text-xs italic text-danger-subtle-fg">
              Linked company is missing — was it deleted?
            </Text>
          )}
          {claim.company?.isClaimed ? (
            <Text className="text-xs text-warning-subtle-fg">
              Heads up — this company is already claimed by another user.
            </Text>
          ) : null}
        </div>
        <Text className="text-muted-fg text-xs">Submitted {submitted}</Text>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-fg text-xs uppercase tracking-wide">
            Submitter
          </dt>
          <dd className="mt-0.5">
            {claim.submitterName}{" "}
            <a
              href={`mailto:${claim.submitterEmail}`}
              className="text-muted-fg hover:text-fg"
            >
              ({claim.submitterEmail})
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-muted-fg text-xs uppercase tracking-wide">Role</dt>
          <dd className="mt-0.5">{claim.submitterRole}</dd>
        </div>
        {claim.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-fg text-xs uppercase tracking-wide">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{claim.notes}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="block text-sm font-medium text-fg"
            htmlFor={`approve-note-${claim._id}`}
          >
            Approval note (optional)
          </label>
          <textarea
            id={`approve-note-${claim._id}`}
            placeholder="Internal note for the audit log…"
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-fg"
            htmlFor={`reject-note-${claim._id}`}
          >
            Rejection reason
          </label>
          <textarea
            id={`reject-note-${claim._id}`}
            placeholder="Required when rejecting…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          intent="primary"
          isDisabled={busy !== null}
          onPress={() => run("approve", () => onApprove(approveNote))}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          intent="outline"
          isDisabled={busy !== null || rejectNote.trim().length === 0}
          onPress={() => run("reject", () => onReject(rejectNote))}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        {error ? (
          <Text className="text-danger-subtle-fg text-sm">{error}</Text>
        ) : null}
      </div>
    </li>
  );
}

function RegistrationsSection({
  registrations,
}: {
  registrations: Doc<"companySubmissions">[] | null;
}) {
  // Registration approve is an action (it geocodes via Mapbox), so it
  // uses `useAction` rather than `useMutation`. The mutation form is gone.
  const approve = useAction(api.companyOnboarding.approveRegistration);
  const reject = useMutation(api.companyOnboarding.rejectRegistration);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BuildingOffice2Icon aria-hidden className="size-5 text-muted-fg" />
        <Heading level={2} className="text-xl tracking-tight">
          New business submissions
        </Heading>
        {registrations ? (
          <Text className="text-muted-fg text-sm">
            ({registrations.length})
          </Text>
        ) : null}
      </div>

      {registrations === null ? (
        <Text className="text-muted-fg text-sm">Loading…</Text>
      ) : registrations.length === 0 ? (
        <Text className="text-muted-fg text-sm">No pending submissions.</Text>
      ) : (
        <ul className="space-y-3">
          {registrations.map((r) => (
            <RegistrationCard
              key={r._id}
              row={r}
              onApprove={(note) =>
                approve({
                  submissionId: r._id,
                  moderatorNote: note || undefined,
                })
              }
              onReject={(reason) =>
                reject({ submissionId: r._id, reason })
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RegistrationCard({
  row,
  onApprove,
  onReject,
}: {
  row: Doc<"companySubmissions">;
  onApprove: (note: string) => Promise<unknown>;
  onReject: (reason: string) => Promise<unknown>;
}) {
  const [rejectNote, setRejectNote] = useState("");
  const [approveNote, setApproveNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (which: "approve" | "reject", fn: () => Promise<unknown>) => {
    setBusy(which);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const submitted = new Date(row.createdAt).toLocaleString();

  return (
    <li className="space-y-4 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Heading level={3} className="text-lg">
            {row.name}
          </Heading>
          {row.website ? (
            <a
              href={
                /^https?:\/\//i.test(row.website)
                  ? row.website
                  : `https://${row.website}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-fg"
            >
              {row.website}
              <ArrowTopRightOnSquareIcon className="size-3" aria-hidden />
            </a>
          ) : (
            <Text className="text-xs italic text-muted-fg">
              No website provided
            </Text>
          )}
        </div>
        <Text className="text-muted-fg text-xs">Submitted {submitted}</Text>
      </div>

      <Text className="text-sm whitespace-pre-wrap">{row.description}</Text>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-fg text-xs uppercase tracking-wide">
            Submitter
          </dt>
          <dd className="mt-0.5">
            {row.submitterName}{" "}
            <a
              href={`mailto:${row.submitterEmail}`}
              className="text-muted-fg hover:text-fg"
            >
              ({row.submitterEmail})
            </a>
          </dd>
        </div>
        {row.submitterRole ? (
          <div>
            <dt className="text-muted-fg text-xs uppercase tracking-wide">
              Role
            </dt>
            <dd className="mt-0.5">{row.submitterRole}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-muted-fg text-xs uppercase tracking-wide">
            Location
          </dt>
          <dd className="mt-0.5">{row.locationRaw}</dd>
        </div>
        {row.sectorRaw ? (
          <div>
            <dt className="text-muted-fg text-xs uppercase tracking-wide">
              Suggested sector
            </dt>
            <dd className="mt-0.5">{row.sectorRaw}</dd>
          </div>
        ) : null}
        {row.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-fg text-xs uppercase tracking-wide">
              Notes
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap">{row.notes}</dd>
          </div>
        ) : null}
      </dl>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            className="block text-sm font-medium text-fg"
            htmlFor={`approve-note-${row._id}`}
          >
            Approval note (optional)
          </label>
          <textarea
            id={`approve-note-${row._id}`}
            placeholder="Internal note for the audit log…"
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium text-fg"
            htmlFor={`reject-note-${row._id}`}
          >
            Rejection reason
          </label>
          <textarea
            id={`reject-note-${row._id}`}
            placeholder="Required when rejecting…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="mt-1 min-h-20 w-full rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm outline-none placeholder:text-muted-fg focus-visible:border-ring/70 focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          intent="primary"
          isDisabled={busy !== null}
          onPress={() => run("approve", () => onApprove(approveNote))}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </Button>
        <Button
          intent="outline"
          isDisabled={busy !== null || rejectNote.trim().length === 0}
          onPress={() => run("reject", () => onReject(rejectNote))}
        >
          {busy === "reject" ? "Rejecting…" : "Reject"}
        </Button>
        {error ? (
          <Text className="text-danger-subtle-fg text-sm">{error}</Text>
        ) : null}
      </div>
    </li>
  );
}
