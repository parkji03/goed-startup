"use client";

import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Button as AriaButton } from "react-aria-components/Button";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/convex/_generated/api";
import {
  CommandMenu,
  CommandMenuFooter,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuSearch,
  CommandMenuSection,
  CommandMenuSeparator,
} from "@/components/ui/command-menu";
import { twMerge } from "tailwind-merge";

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

type Props = {
  className?: string;
};

export function GlobalCommandTrigger({ className }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AriaButton
        onPress={() => setOpen(true)}
        className={twMerge(
          "inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-muted-fg text-sm hover:bg-muted",
          className,
        )}
      >
        <MagnifyingGlassIcon className="size-4 shrink-0" />
        <span className="hidden truncate sm:inline">Search</span>
        <kbd className="ms-auto hidden h-5 items-center rounded bg-muted-fg/10 px-1 py-1 text-[12px] font-medium tracking-wider text-muted-fg sm:inline-flex">⌘K</kbd>
      </AriaButton>

      {/* Mounted permanently so CommandMenu's `shortcut="k"` can listen for ⌘K
          even when the menu is closed. */}
      <GlobalCommandMenu open={open} onOpenChange={setOpen} />
    </>
  );
}

function GlobalCommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const debounced = useDebouncedValue(input, 200);
  const trimmed = debounced.trim();

  const results = useQuery(
    api.resources.search,
    trimmed ? { query: trimmed, limit: 12 } : "skip",
  );

  const navigate = (href: string) => {
    router.push(href);
    onOpenChange(false);
  };

  const resourceItems = useMemo(() => {
    return (
      results?.map((r) => ({
        kind: "resource" as const,
        id: r._id,
        title: r.title,
        subtitle: r.tags.slice(0, 2).join(" · "),
        slug: r.slug,
      })) ?? []
    );
  }, [results]);

  const pending = trimmed.length > 0 && results === undefined;

  return (
    <CommandMenu
      isOpen={open}
      onOpenChange={onOpenChange}
      shortcut="k"
      disableClientFilter
      inputValue={input}
      onInputChange={setInput}
      aria-label="Search resources"
    >
      <CommandMenuSearch placeholder="Search resources, Cmd+K" />

      <CommandMenuList aria-label="Search results menu">
        <CommandMenuSection aria-label="Resources" items={resourceItems} label="Resources">
          {(item) => (
            <CommandMenuItem
              key={item.id}
              textValue={`${item.title} ${item.subtitle}`}
              onAction={() => navigate(`/resources/${item.slug}`)}
            >
              <span className="block truncate font-medium text-fg">{item.title}</span>
              <span className="block truncate text-muted-fg text-xs">{item.subtitle}</span>
            </CommandMenuItem>
          )}
        </CommandMenuSection>

        {trimmed.length > 0 && resourceItems.length === 0 && !pending ? (
          <>
            <CommandMenuSeparator />
            <CommandMenuSection label="Suggestions" items={[{ id: "ai", label: "Ask the Utah Founder Guide" }]}>
              {(row) => (
                <CommandMenuItem
                  key={row.id}
                  textValue={row.label}
                  onAction={() => navigate(`/guide?q=${encodeURIComponent(trimmed)}`)}
                >
                  {row.label}
                </CommandMenuItem>
              )}
            </CommandMenuSection>
          </>
        ) : null}

        <CommandMenuSeparator />
        <CommandMenuSection
          label="Go to"
          items={[
            { id: "res", title: "Resource library", href: "/resources" },
            { id: "quiz", title: "Founder questionnaire", href: "/quiz" },
            { id: "guide", title: "AI guide", href: "/guide" },
            { id: "sub", title: "Submit a resource", href: "/resources/submit" },
          ]}
        >
          {(row) => (
            <CommandMenuItem key={row.id} textValue={row.title} onAction={() => navigate(row.href)}>
              {row.title}
            </CommandMenuItem>
          )}
        </CommandMenuSection>
      </CommandMenuList>

      <CommandMenuFooter className="flex flex-wrap justify-between gap-2">
        <span>{pending ? "Searching…" : "Esc to close · Not finding it?"}</span>
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={() => navigate(`/guide?q=${encodeURIComponent(trimmed || "help me find resources")}`)}
        >
          Ask the AI guide
        </button>
      </CommandMenuFooter>
    </CommandMenu>
  );
}
