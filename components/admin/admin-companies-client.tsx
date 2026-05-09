"use client";

import {
  ArrowTopRightOnSquareIcon,
  ShieldCheckIcon,
} from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "@/convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { Link } from "@/i18n/navigation";
import { Text } from "@/components/ui/text";
import { TextField } from "@/components/ui/text-field";

const PAGE_SIZE = 30;

/** Walk up the DOM to find the nearest scrollable ancestor (overflow auto/scroll). */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null;
  while (parent) {
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === "auto" || overflowY === "scroll") return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** Same denied-reason copy as the inbox client. Kept inline since this is
 * the only other admin page that needs it; can be lifted into a shared
 * helper if a third surface lands. */
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

export function AdminCompaniesClient() {
  const tTax = useTranslations("Taxonomy");
  const result = useQuery(api.companyDashboard.listAllForAdmin);
  const [search, setSearch] = useState("");

  const allCompanies = result?.access === "allowed" ? result.companies : null;

  // Client-side filter — the dataset is small (~220 rows) so a simple
  // includes() match is fine. If it grows past a few thousand we'd push
  // search server-side via the existing `search_text` index.
  const filtered = useMemo(() => {
    if (!allCompanies) return null;
    const q = search.trim().toLowerCase();
    if (!q) return allCompanies;
    return allCompanies.filter((c) => {
      const haystack = [c.name, c.slug, c.claimerEmail ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allCompanies, search]);

  // Windowed render: mount only the first PAGE_SIZE rows, then bump the
  // window each time the bottom sentinel scrolls into view. Mirrors the
  // map's EntityList so DOM weight stays bounded as the dataset grows.
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLLIElement | null>(null);
  const total = filtered?.length ?? 0;
  const hasMore = visible < total;

  // Reset the window whenever the filtered set changes (new search, fresh data).
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [filtered]);

  useEffect(() => {
    if (!hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const root = findScrollParent(sentinel);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => Math.min(v + PAGE_SIZE, total));
        }
      },
      { root, rootMargin: "200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, total]);

  if (result?.access === "denied") {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
        <Text className="text-sm font-medium text-danger-subtle-fg">
          Cannot load companies
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
      <TextField value={search} onChange={setSearch}>
        <Label>Search</Label>
        <Input placeholder="Filter by name, slug, or claimer email…" />
      </TextField>

      <Text className="text-muted-fg text-xs">
        {filtered.length === allCompanies?.length
          ? `${filtered.length} companies`
          : `${filtered.length} of ${allCompanies?.length} companies`}
      </Text>

      {filtered.length === 0 ? (
        <Text className="text-muted-fg text-sm">No matches.</Text>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {filtered.slice(0, visible).map((c) => (
            <li
              key={c._id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="text-sm font-medium text-fg">
                    {c.name}
                  </Text>
                  <Badge intent={c.status === "published" ? "success" : "warning"}>
                    {c.status}
                  </Badge>
                  {c.isClaimed ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      <ShieldCheckIcon className="size-3" aria-hidden />
                      Claimed
                    </span>
                  ) : null}
                </div>
                <Text className="text-muted-fg text-xs">
                  {tTax(`sectors.${c.sector}`)} · /{c.slug}
                  {c.claimerEmail ? ` · ${c.claimerEmail}` : ""}
                </Text>
              </div>
              <Link
                href={`/dashboard/${c.slug}`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Edit
                <ArrowTopRightOnSquareIcon className="size-3" aria-hidden />
              </Link>
            </li>
          ))}
          {hasMore && <li ref={sentinelRef} aria-hidden="true" className="h-px" />}
        </ul>
      )}
    </div>
  );
}
