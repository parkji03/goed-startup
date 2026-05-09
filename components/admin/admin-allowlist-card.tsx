'use client';

import { useMutation, useQuery } from 'convex/react';
import { TrashIcon } from '@heroicons/react/20/solid';
import { useState, type FormEvent } from 'react';
import { twMerge } from 'tailwind-merge';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Code, Text } from '@/components/ui/text';
import { Heading } from '@/components/ui/heading';
import { Input, InputGroup } from '@/components/ui/input';
import { TextField } from '@/components/ui/text-field';
import { Tooltip, TooltipContent } from '@/components/ui/tooltip';

type Kind = 'email' | 'domain';

/**
 * Admin allowlist surface. Two layers:
 *
 *   • **Env (locked)** — entries from `ADMIN_EMAILS` /
 *     `ADMIN_EMAIL_DOMAINS` on the Convex deployment. Read-only here:
 *     editing requires `npx convex env set`. These are the safety floor
 *     so the runtime layer can never lock the deployment out.
 *   • **Table (editable)** — `adminAllowlist` rows. Any current admin
 *     can add or remove entries here; they take effect immediately
 *     since `checkAdminGate` reads the table on every request.
 *
 * The query is `requireAdmin`-gated, so non-admins (who shouldn't reach
 * this page anyway) see a permanent loading skeleton rather than the
 * email list.
 */
export function AdminAllowlistCard() {
  const data = useQuery(api.admin.listAllowlist);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-muted/40 pb-4 pt-(--gutter)">
        <Heading level={2} className="text-base font-semibold">
          Admin allowlist
        </Heading>
        <Text className="mt-1 text-sm text-muted-fg">
          Anyone whose email matches an entry below can sign in as an admin.
          Env entries are deploy-locked; table entries are editable here.
        </Text>
      </CardHeader>

      <CardContent className="space-y-6 pb-(--gutter) pt-(--gutter)">
        <EnvSection
          label="Locked emails"
          envVar="ADMIN_EMAILS"
          items={data?.env.emails}
          emptyHint="No env-locked emails."
        />
        <EnvSection
          label="Locked domains"
          envVar="ADMIN_EMAIL_DOMAINS"
          items={data?.env.domains}
          emptyHint="No env-locked domains."
          format={(d) => `*@${d}`}
        />

        <hr className="border-border" />

        <TableSection
          title="Editable allowlist"
          items={data?.table}
        />

        <AddEntryForm />
      </CardContent>
    </Card>
  );
}

function EnvSection({
  label,
  envVar,
  items,
  emptyHint,
  format = (s) => s,
}: {
  label: string;
  envVar: string;
  items: string[] | undefined;
  emptyHint: string;
  format?: (s: string) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
          {label}
        </Text>
        <Code className="font-mono text-[11px] text-muted-fg">{envVar}</Code>
      </div>
      {items === undefined ? (
        <div className="mt-2 h-9 animate-pulse rounded-md bg-muted/60" />
      ) : items.length === 0 ? (
        <Text className="mt-2 text-sm text-muted-fg">{emptyHint}</Text>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {items.map((item) => (
            <li
              key={item}
              className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-fg"
            >
              {format(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TableRow = {
  _id: Id<'adminAllowlist'>;
  kind: Kind;
  value: string;
  note: string | null;
  addedByEmail: string;
  addedAt: number;
};

function TableSection({
  title,
  items,
}: {
  title: string;
  items: TableRow[] | undefined;
}) {
  return (
    <div>
      <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
        {title}
      </Text>
      {items === undefined ? (
        <div className="mt-2 h-9 animate-pulse rounded-md bg-muted/60" />
      ) : items.length === 0 ? (
        <Text className="mt-2 text-sm text-muted-fg">
          No entries yet — use the form below to add one.
        </Text>
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {items.map((row) => (
            <TableEntry key={row._id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TableEntry({ row }: { row: TableRow }) {
  const remove = useMutation(api.admin.removeAllowlistEntry);
  const [busy, setBusy] = useState(false);

  const display = row.kind === 'email' ? row.value : `*@${row.value}`;
  const onRemove = async () => {
    setBusy(true);
    try {
      await remove({ id: row._id });
    } catch (err) {
      setBusy(false);
      console.error(err);
    }
  };

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-fg">
        {row.kind}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-sm text-fg">
        {display}
      </span>
      <span
        className="hidden text-xs text-muted-fg sm:inline"
        title={`Added ${new Date(row.addedAt).toLocaleString()}`}
      >
        by {row.addedByEmail}
      </span>
      <Tooltip>
        <Button
          intent="outline"
          size="sq-xs"
          onPress={onRemove}
          isDisabled={busy}
          aria-label={`Remove ${display}`}
        >
          <TrashIcon />
        </Button>
        <TooltipContent>Remove</TooltipContent>
      </Tooltip>
    </li>
  );
}

function AddEntryForm() {
  const add = useMutation(api.admin.addAllowlistEntry);
  const [kind, setKind] = useState<Kind>('email');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const result = await add({ kind, value: trimmed });
      if (result.status === 'already_present') {
        setError('That entry is already on the allowlist.');
      } else {
        setValue('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <Text className="text-xs font-semibold tracking-wide uppercase text-muted-fg">
        Add entry
      </Text>
      <div className="flex flex-wrap items-stretch gap-2">
        {/* Segmented kind toggle. Two buttons share state via aria-pressed
            so it's a clear "one of two" choice without dragging in the
            full Select primitive for two options. */}
        <div className="inline-flex shrink-0 rounded-md border border-border p-0.5">
          {(['email', 'domain'] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={twMerge(
                'rounded-sm px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                kind === k
                  ? 'bg-fg text-bg'
                  : 'text-muted-fg hover:text-fg',
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <TextField
          aria-label={kind === 'email' ? 'Email address' : 'Domain'}
          value={value}
          onChange={setValue}
          className="flex-1 min-w-[14rem]"
        >
          <InputGroup>
            <Input
              placeholder={
                kind === 'email' ? 'someone@example.com' : 'example.com'
              }
              autoComplete="off"
              spellCheck={false}
            />
          </InputGroup>
        </TextField>
        <Button
          type="submit"
          intent="primary"
          size="sm"
          isDisabled={busy || !value.trim()}
        >
          Add
        </Button>
      </div>
      {error && (
        <Text className="text-sm text-danger">{error}</Text>
      )}
    </form>
  );
}
