"use client";

import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  PlusIcon,
} from "@heroicons/react/20/solid";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Description, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { TextField } from "@/components/ui/text-field";
import {
  RESOURCE_CATEGORIES,
  type ResourceCategoryKey,
  categoryLabel,
} from "@/lib/resources/categories";

type ResourceStatus = "draft" | "published" | "archived";

type AdminResource = {
  _id: Id<"resources">;
  title: string;
  slug: string;
  description: string;
  url: string;
  contactEmail: string | null;
  category: ResourceCategoryKey;
  tags: string[];
  stageTags: string[];
  communities: string[];
  industries: string[];
  locations: string[];
  status: ResourceStatus;
  sourceId: string | null;
};

const STATUS_OPTIONS: ReadonlyArray<{ key: ResourceStatus; label: string }> = [
  { key: "published", label: "Published" },
  { key: "draft", label: "Draft" },
  { key: "archived", label: "Archived" },
];

/** Same denied-reason copy as the other admin clients. */
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

function statusBadgeIntent(
  status: ResourceStatus,
): "success" | "warning" | "secondary" {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "secondary";
}

export function AdminResourcesClient() {
  const result = useQuery(api.adminResources.listAllForAdmin);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminResource | null>(null);
  const [creating, setCreating] = useState(false);

  const all = result?.access === "allowed" ? result.resources : null;

  const filtered = useMemo(() => {
    if (!all) return null;
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => {
      const haystack = [r.title, r.slug, r.url, r.category, ...r.tags]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [all, search]);

  if (result?.access === "denied") {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
        <Text className="text-sm font-medium text-danger-subtle-fg">
          Cannot load resources
        </Text>
        <Text className="text-muted-fg text-sm">
          {adminAccessBlockedMessage(result.reason)}
        </Text>
      </div>
    );
  }

  if (filtered === null) {
    return <Text className="text-muted-fg text-sm">Loading…</Text>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <TextField
          value={search}
          onChange={setSearch}
          className="min-w-64 flex-1"
        >
          <Label>Search</Label>
          <Input placeholder="Filter by title, slug, URL, category, or tag…" />
        </TextField>
        <Button intent="primary" onPress={() => setCreating(true)}>
          <PlusIcon className="size-4" aria-hidden />
          Add resource
        </Button>
      </div>

      <Text className="text-muted-fg text-xs">
        {filtered.length === all?.length
          ? `${filtered.length} resources`
          : `${filtered.length} of ${all?.length} resources`}
      </Text>

      {filtered.length === 0 ? (
        <Text className="text-muted-fg text-sm">No matches.</Text>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {filtered.map((r) => (
            <ResourceRow
              key={r._id}
              resource={r}
              onEdit={() => setEditing(r)}
            />
          ))}
        </ul>
      )}

      <ResourceFormModal
        mode="edit"
        isOpen={editing !== null}
        resource={editing}
        onClose={() => setEditing(null)}
      />
      <ResourceFormModal
        mode="create"
        isOpen={creating}
        resource={null}
        onClose={() => setCreating(false)}
      />
    </div>
  );
}

function ResourceRow({
  resource,
  onEdit,
}: {
  resource: AdminResource;
  onEdit: () => void;
}) {
  const setStatus = useMutation(api.adminResources.setStatusForAdmin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(next: ResourceStatus) {
    if (next === resource.status) return;
    setBusy(true);
    setError(null);
    try {
      await setStatus({ id: resource._id, status: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="text-sm font-medium text-fg">{resource.title}</Text>
          <Badge intent={statusBadgeIntent(resource.status)}>
            {resource.status}
          </Badge>
        </div>
        <Text className="text-muted-fg text-xs">
          {categoryLabel(resource.category)} · /{resource.slug}
        </Text>
        {error ? (
          <Text className="text-danger-subtle-fg text-xs">{error}</Text>
        ) : null}
      </div>
      <Select
        className="min-w-32"
        aria-label={`Status for ${resource.title}`}
        selectedKey={resource.status}
        isDisabled={busy}
        onSelectionChange={(key) => {
          if (typeof key === "string") {
            void changeStatus(key as ResourceStatus);
          }
        }}
      >
        <SelectTrigger />
        <SelectContent items={STATUS_OPTIONS}>
          {(s) => (
            <SelectItem id={s.key} textValue={s.label}>
              {s.label}
            </SelectItem>
          )}
        </SelectContent>
      </Select>
      <a
        href={resource.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Visit
        <ArrowTopRightOnSquareIcon className="size-3" aria-hidden />
      </a>
      <Button intent="outline" onPress={onEdit}>
        <PencilSquareIcon className="size-4" aria-hidden />
        Edit
      </Button>
    </li>
  );
}

type FormState = {
  title: string;
  description: string;
  url: string;
  contactEmail: string;
  category: ResourceCategoryKey | null;
  tagsRaw: string;
  stageTagsRaw: string;
  communitiesRaw: string;
  industriesRaw: string;
  locationsRaw: string;
  status: ResourceStatus;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  url: "",
  contactEmail: "",
  category: null,
  tagsRaw: "",
  stageTagsRaw: "",
  communitiesRaw: "",
  industriesRaw: "",
  locationsRaw: "",
  status: "published",
};

function fromResource(r: AdminResource): FormState {
  return {
    title: r.title,
    description: r.description,
    url: r.url,
    contactEmail: r.contactEmail ?? "",
    category: r.category,
    tagsRaw: r.tags.join(", "),
    stageTagsRaw: r.stageTags.join(", "),
    communitiesRaw: r.communities.join(", "),
    industriesRaw: r.industries.join(", "),
    locationsRaw: r.locations.join(", "),
    status: r.status,
  };
}

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ResourceFormModal({
  mode,
  isOpen,
  resource,
  onClose,
}: {
  mode: "edit" | "create";
  isOpen: boolean;
  resource: AdminResource | null;
  onClose: () => void;
}) {
  return (
    <ModalContent
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="3xl"
      aria-label={mode === "create" ? "Add resource" : "Edit resource"}
    >
      <ModalHeader>
        <ModalTitle>
          {mode === "create" ? "Add resource" : "Edit resource"}
        </ModalTitle>
      </ModalHeader>
      {/* Inner form remounts whenever the target resource changes. Lets
          the form initialize state directly from props instead of
          syncing prop → state via an effect (which lint flags as a
          cascading-render anti-pattern). */}
      {isOpen ? (
        <ResourceFormBody
          key={resource?._id ?? "__new__"}
          mode={mode}
          resource={resource}
          onClose={onClose}
        />
      ) : null}
    </ModalContent>
  );
}

function ResourceFormBody({
  mode,
  resource,
  onClose,
}: {
  mode: "edit" | "create";
  resource: AdminResource | null;
  onClose: () => void;
}) {
  const upsert = useMutation(api.adminResources.upsertForAdmin);
  const [form, setForm] = useState<FormState>(() =>
    resource ? fromResource(resource) : EMPTY_FORM,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.category) {
      setError("Pick a category.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const contactEmail = form.contactEmail.trim();
      await upsert({
        id: mode === "edit" && resource ? resource._id : undefined,
        fields: {
          title: form.title,
          description: form.description,
          url: form.url,
          contactEmail: contactEmail || undefined,
          category: form.category,
          tags: splitList(form.tagsRaw),
          stageTags: splitList(form.stageTagsRaw),
          communities: splitList(form.communitiesRaw),
          industries: splitList(form.industriesRaw),
          locations: splitList(form.locationsRaw),
          status: form.status,
        },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="contents">
      <ModalBody className="space-y-4">
          <TextField
            value={form.title}
            onChange={(v) => setForm((f) => ({ ...f, title: v }))}
            isRequired
          >
            <Label>Title</Label>
            <Input placeholder="Utah Innovation Fund" />
          </TextField>

          <div className="space-y-1.5">
            <Label htmlFor="resource-description">Description</Label>
            <Textarea
              id="resource-description"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              required
              className="min-h-28"
              placeholder="Short paragraph that shows up on the resource card."
            />
          </div>

          <TextField
            value={form.url}
            onChange={(v) => setForm((f) => ({ ...f, url: v }))}
            isRequired
          >
            <Label>URL</Label>
            <Input
              type="url"
              placeholder="https://example.com"
            />
            <Description>Must start with http:// or https://.</Description>
          </TextField>

          <TextField
            value={form.contactEmail}
            onChange={(v) => setForm((f) => ({ ...f, contactEmail: v }))}
          >
            <Label>Contact email</Label>
            <Input type="email" placeholder="hello@example.com" />
            <Description>Optional. Surfaces on the resource page.</Description>
          </TextField>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              aria-label="Category"
              placeholder="Pick a category"
              selectedKey={form.category ?? null}
              onSelectionChange={(key) => {
                if (typeof key === "string") {
                  setForm((f) => ({
                    ...f,
                    category: key as ResourceCategoryKey,
                  }));
                }
              }}
            >
              <Label>Category</Label>
              <SelectTrigger />
              <SelectContent items={RESOURCE_CATEGORIES}>
                {(c) => (
                  <SelectItem id={c.key} textValue={c.label}>
                    {c.label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>

            <Select
              aria-label="Status"
              selectedKey={form.status}
              onSelectionChange={(key) => {
                if (typeof key === "string") {
                  setForm((f) => ({ ...f, status: key as ResourceStatus }));
                }
              }}
            >
              <Label>Status</Label>
              <SelectTrigger />
              <SelectContent items={STATUS_OPTIONS}>
                {(s) => (
                  <SelectItem id={s.key} textValue={s.label}>
                    {s.label}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              value={form.tagsRaw}
              onChange={(v) => setForm((f) => ({ ...f, tagsRaw: v }))}
            >
              <Label>Tags</Label>
              <Input placeholder="AI, women-led, climate" />
              <Description>Comma-separated.</Description>
            </TextField>

            <TextField
              value={form.stageTagsRaw}
              onChange={(v) => setForm((f) => ({ ...f, stageTagsRaw: v }))}
            >
              <Label>Stage tags</Label>
              <Input placeholder="pre-seed, seed, series-a" />
              <Description>
                Comma-separated. Leave blank to derive from tags.
              </Description>
            </TextField>

            <TextField
              value={form.communitiesRaw}
              onChange={(v) => setForm((f) => ({ ...f, communitiesRaw: v }))}
            >
              <Label>Communities</Label>
              <Input placeholder="Women, Veterans, BIPOC" />
              <Description>Comma-separated.</Description>
            </TextField>

            <TextField
              value={form.industriesRaw}
              onChange={(v) => setForm((f) => ({ ...f, industriesRaw: v }))}
            >
              <Label>Industries</Label>
              <Input placeholder="Software, Hardware, Bio" />
              <Description>Comma-separated.</Description>
            </TextField>

            <TextField
              value={form.locationsRaw}
              onChange={(v) => setForm((f) => ({ ...f, locationsRaw: v }))}
              className="sm:col-span-2"
            >
              <Label>Locations</Label>
              <Input placeholder="Salt Lake City, Provo, Statewide" />
              <Description>Comma-separated.</Description>
            </TextField>
          </div>

          {error ? (
            <Text className="text-danger-subtle-fg text-sm">{error}</Text>
          ) : null}
      </ModalBody>
      <ModalFooter>
        <Button intent="outline" onPress={onClose} isDisabled={busy}>
          Cancel
        </Button>
        <Button type="submit" intent="primary" isDisabled={busy}>
          {busy
            ? mode === "create"
              ? "Adding…"
              : "Saving…"
            : mode === "create"
              ? "Add resource"
              : "Save changes"}
        </Button>
      </ModalFooter>
    </form>
  );
}

