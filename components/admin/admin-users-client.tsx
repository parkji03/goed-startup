'use client';

import { useMutation, useQuery } from 'convex/react';
import { ArrowUturnLeftIcon, ShieldExclamationIcon } from '@heroicons/react/20/solid';
import { useState, type FormEvent } from 'react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Input, InputGroup } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { TextField } from '@/components/ui/text-field';
import { Tooltip, TooltipContent } from '@/components/ui/tooltip';

/**
 * Two-list user management surface for admins:
 *
 *   • **Claimers** — every user with at least one `companies.claimedBy`
 *     pointing at them. Each row shows the claim count and a "Revoke"
 *     action. Already-revoked claimers are tagged so the admin can see
 *     who's blocked without flipping tabs.
 *   • **Revoked** — everyone in the `revokedUsers` table, with a
 *     "Restore" action. Includes a manual revoke-by-email form so the
 *     admin can revoke a user who hasn't claimed anything yet (e.g. a
 *     known bad actor who's only signed in).
 *
 * The two queries are independent subscriptions, so a revoke action
 * updates both lists live without a manual refresh.
 */
export function AdminUsersClient() {
  const claimers = useQuery(api.users.listClaimers);
  const revoked = useQuery(api.users.listRevoked);

  return (
    <div className="space-y-8">
      <ClaimersSection claimers={claimers} />
      <hr className="border-border" />
      <RevokedSection revoked={revoked} />
      <RevokeByEmailForm />
    </div>
  );
}

type Claimer = {
  tokenIdentifier: string;
  email: string | null;
  claimedCompanyCount: number;
  claimedCompanyNames: string[];
  revoked: boolean;
};

function ClaimersSection({ claimers }: { claimers: Claimer[] | undefined }) {
  return (
    <div>
      <SectionHeading
        label="Claimers"
        hint="Owners who have claimed at least one business listing."
      />
      {claimers === undefined ? (
        <SkeletonList />
      ) : claimers.length === 0 ? (
        <EmptyState>
          No one has claimed a business yet. Once someone does, they&rsquo;ll
          show up here.
        </EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {claimers.map((c) => (
            <ClaimerRow key={c.tokenIdentifier} claimer={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ClaimerRow({ claimer }: { claimer: Claimer }) {
  const revoke = useMutation(api.users.revoke);
  const [busy, setBusy] = useState(false);

  const onRevoke = async () => {
    if (busy) return;
    const label = claimer.email ?? 'this user';
    if (
      !confirm(
        `Revoke ${label}'s access to the management portal? They'll be redirected to the access-removed page on their next request.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await revoke({ tokenIdentifier: claimer.tokenIdentifier });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="truncate font-medium text-fg">
            {claimer.email ?? '(email unknown)'}
          </Text>
          {claimer.revoked && (
            <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger-subtle-fg">
              Revoked
            </span>
          )}
        </div>
        <Text className="mt-0.5 truncate text-xs text-muted-fg">
          Claims {claimer.claimedCompanyCount} ·{' '}
          {claimer.claimedCompanyNames.slice(0, 3).join(', ')}
          {claimer.claimedCompanyNames.length > 3 &&
            `, +${claimer.claimedCompanyNames.length - 3} more`}
        </Text>
      </div>
      {!claimer.revoked && (
        <Button
          intent="outline"
          size="xs"
          onPress={onRevoke}
          isDisabled={busy}
          aria-label={`Revoke access for ${claimer.email ?? 'user'}`}
        >
          <ShieldExclamationIcon />
          Revoke access
        </Button>
      )}
    </li>
  );
}

type Revoked = {
  _id: Id<'revokedUsers'>;
  tokenIdentifier: string;
  email: string;
  reason: string | null;
  revokedAt: number;
  revokedByEmail: string;
};

function RevokedSection({ revoked }: { revoked: Revoked[] | undefined }) {
  return (
    <div>
      <SectionHeading
        label="Revoked accounts"
        hint="These users see the access-removed page when they sign in."
      />
      {revoked === undefined ? (
        <SkeletonList />
      ) : revoked.length === 0 ? (
        <EmptyState>No one is currently revoked.</EmptyState>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
          {revoked.map((r) => (
            <RevokedRow key={r._id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RevokedRow({ row }: { row: Revoked }) {
  const restore = useMutation(api.users.restore);
  const [busy, setBusy] = useState(false);

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await restore({ id: row._id });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to restore.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Text className="truncate font-medium text-fg">{row.email}</Text>
        <Text className="mt-0.5 truncate text-xs text-muted-fg">
          Revoked {new Date(row.revokedAt).toLocaleDateString()} by{' '}
          {row.revokedByEmail}
          {row.reason ? ` · ${row.reason}` : ''}
        </Text>
      </div>
      <Tooltip>
        <Button
          intent="outline"
          size="xs"
          onPress={onRestore}
          isDisabled={busy}
          aria-label={`Restore access for ${row.email}`}
        >
          <ArrowUturnLeftIcon />
          Restore
        </Button>
        <TooltipContent>Lift the revocation</TooltipContent>
      </Tooltip>
    </li>
  );
}

function RevokeByEmailForm() {
  const revoke = useMutation(api.users.revoke);
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    try {
      const result = await revoke({
        email: trimmed,
        reason: reason.trim() || undefined,
      });
      if (result.status === 'already_revoked') {
        setError('That account is already revoked.');
      } else {
        setEmail('');
        setReason('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <SectionHeading
        label="Revoke by email"
        hint="The user must have signed in at least once for the lookup to find them."
      />
      <div className="flex flex-wrap items-stretch gap-2">
        <TextField
          aria-label="Email to revoke"
          value={email}
          onChange={setEmail}
          className="min-w-[14rem] flex-1"
        >
          <InputGroup>
            <Input
              type="email"
              placeholder="someone@example.com"
              autoComplete="off"
              spellCheck={false}
            />
          </InputGroup>
        </TextField>
        <TextField
          aria-label="Reason (optional)"
          value={reason}
          onChange={setReason}
          className="min-w-[12rem] flex-1"
        >
          <InputGroup>
            <Input placeholder="Reason (optional)" autoComplete="off" />
          </InputGroup>
        </TextField>
        <Button
          type="submit"
          intent="primary"
          size="sm"
          isDisabled={busy || !email.trim()}
        >
          Revoke
        </Button>
      </div>
      {error && <Text className="text-sm text-danger">{error}</Text>}
    </form>
  );
}

function SectionHeading({ label, hint }: { label: string; hint: string }) {
  return (
    <div>
      <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
        {label}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-fg">{hint}</Text>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="mt-3 space-y-2">
      <div className="h-12 animate-pulse rounded-md bg-muted/60" />
      <div className="h-12 animate-pulse rounded-md bg-muted/60" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
      <Text className="text-sm text-muted-fg">{children}</Text>
    </div>
  );
}
