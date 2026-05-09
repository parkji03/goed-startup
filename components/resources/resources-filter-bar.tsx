"use client";

import { FunnelIcon } from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { Button as RACButton } from "react-aria-components/Button";
import { Dialog } from "react-aria-components/Dialog";
import { DialogTrigger } from "react-aria-components/Dialog";
import { Popover as PopoverPrimitive } from "react-aria-components/Popover";
import { twMerge } from "tailwind-merge";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ListBox, ListBoxItem } from "@/components/ui/list-box";
import {
  countActiveResourceFilters,
  EMPTY_RESOURCE_FILTERS,
  parseResourceFiltersFromParams,
  type ResourceFilters,
  serializeResourceFiltersToParams,
} from "@/lib/resources/filters";

type Option = { id: string; name: string };

function toOptions(values: readonly string[]): Option[] {
  return values.map((v) => ({ id: v, name: v }));
}

function titleCase(s: string): string {
  return s
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

interface FacetSectionProps {
  label: string;
  options: Option[];
  value: string[];
  onChange: (next: string[]) => void;
  /** True when this section sits below another and needs a separating border. */
  divider?: boolean;
}

/**
 * One labelled multi-select inside the filters popover. Capped height with
 * internal scroll so a long facet (industry, location) doesn't stretch the
 * popover off-screen.
 */
function FacetSection({ label, options, value, onChange, divider }: FacetSectionProps) {
  const selectedCount = value.length;
  return (
    <div className={twMerge("px-1 py-2", divider && "border-t border-border")}>
      <div className="mb-1.5 flex items-center justify-between px-2">
        <span className="text-fg/80 text-xs font-medium uppercase tracking-wide">{label}</span>
        {selectedCount > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-muted-fg hover:text-fg text-xs"
          >
            Clear
          </button>
        ) : null}
      </div>
      {options.length === 0 ? (
        <p className="px-2 py-1 text-muted-fg text-xs">No options</p>
      ) : (
        <ListBox
          aria-label={label}
          selectionMode="multiple"
          selectedKeys={value}
          onSelectionChange={(keys) => {
            if (keys === "all") onChange(options.map((o) => o.id));
            else onChange(Array.from(keys) as string[]);
          }}
          items={options}
          // Override the default border + bg so sections blend into the popover.
          className="max-h-44 w-full grid-cols-[auto_1fr] border-0 bg-transparent p-0"
        >
          {(item) => (
            <ListBoxItem id={item.id} textValue={item.name}>
              {item.name}
            </ListBoxItem>
          )}
        </ListBox>
      )}
    </div>
  );
}

/**
 * Single icon-only trigger that opens a popover containing every facet
 * filter (Stage, Industry, Community, Location). Compact replacement for
 * a row of chips — modeled after Linear's view-options popover. State is
 * mirrored to URL search params so views are shareable.
 */
export function ResourcesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseResourceFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );

  const updateFilters = useCallback(
    (next: ResourceFilters) => {
      const ownKeys = new Set(["stage", "industry", "community", "location"]);
      const preserved = new URLSearchParams();
      for (const [k, v] of searchParams.entries()) {
        if (!ownKeys.has(k)) preserved.append(k, v);
      }
      const filterParams = new URLSearchParams(serializeResourceFiltersToParams(next));
      for (const [k, v] of filterParams.entries()) preserved.set(k, v);
      const qs = preserved.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const facets = useQuery(api.resources.listFilterFacets, {});
  const stageOptions = useMemo<Option[]>(
    () => toOptions(facets?.stage ?? []).map((o) => ({ id: o.id, name: titleCase(o.name) })),
    [facets?.stage],
  );
  const industryOptions = useMemo<Option[]>(() => toOptions(facets?.industry ?? []), [facets?.industry]);
  const communityOptions = useMemo<Option[]>(() => toOptions(facets?.community ?? []), [facets?.community]);
  const locationOptions = useMemo<Option[]>(() => toOptions(facets?.location ?? []), [facets?.location]);

  const activeCount = countActiveResourceFilters(filters);
  const isActive = activeCount > 0;

  return (
    <DialogTrigger>
      <RACButton
        aria-label={isActive ? `Filters (${activeCount} active)` : "Filters"}
        className={twMerge(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg shadow-sm transition-colors",
          "pressed:bg-muted hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "h-9 px-3 text-sm",
          isActive ? "border-fg/40 bg-fg/5 font-medium" : undefined,
        )}
      >
        <FunnelIcon className="size-4 text-muted-fg" aria-hidden />
        {isActive ? (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-fg px-1.5 text-[10px] font-semibold text-bg"
          >
            {activeCount}
          </span>
        ) : null}
      </RACButton>

      <PopoverPrimitive
        offset={6}
        placement="bottom end"
        className={twMerge(
          "w-72 overflow-hidden rounded-xl border border-border bg-bg shadow-lg",
          "entering:animate-in entering:fade-in-0 entering:zoom-in-95",
          "exiting:animate-out exiting:fade-out-0 exiting:zoom-out-95",
        )}
      >
        <Dialog className="outline-none">
          <div className="max-h-[70vh] overflow-y-auto">
            <FacetSection
              label="Stage"
              options={stageOptions}
              value={filters.stages}
              onChange={(stages) => updateFilters({ ...filters, stages })}
            />
            <FacetSection
              label="Industry"
              options={industryOptions}
              value={filters.industries}
              onChange={(industries) => updateFilters({ ...filters, industries })}
              divider
            />
            <FacetSection
              label="Community"
              options={communityOptions}
              value={filters.communities}
              onChange={(communities) => updateFilters({ ...filters, communities })}
              divider
            />
            <FacetSection
              label="Location"
              options={locationOptions}
              value={filters.locations}
              onChange={(locations) => updateFilters({ ...filters, locations })}
              divider
            />
          </div>
          {isActive ? (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-muted-fg text-xs">
                {activeCount} {activeCount === 1 ? "filter" : "filters"} active
              </span>
              <Button
                size="xs"
                intent="plain"
                onPress={() => updateFilters(EMPTY_RESOURCE_FILTERS)}
              >
                Clear all
              </Button>
            </div>
          ) : null}
        </Dialog>
      </PopoverPrimitive>
    </DialogTrigger>
  );
}
