'use client';

import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { Button } from 'react-aria-components/Button';
import { Dialog } from 'react-aria-components/Dialog';
import { DialogTrigger } from 'react-aria-components/Dialog';
import { Popover as PopoverPrimitive } from 'react-aria-components/Popover';
import { ListBox, ListBoxItem } from '@/components/ui/list-box';
import { twMerge } from 'tailwind-merge';

type Option<Id extends string> = { id: Id; name: string };

interface FilterChipProps<Id extends string> {
  label: string;
  options: Option<Id>[];
  value: Id[];
  onChange: (value: Id[]) => void;
  /** Default trigger is medium-sized; pass "sm" for the floating bar style. */
  size?: 'sm' | 'md';
}

/**
 * Compact pill-shaped multi-select trigger. Empty state shows just the
 * label and a chevron; once anything is selected it adds a small count
 * badge. Click opens a popover with a checkbox-style ListBox so the user
 * can multi-select. State is fully controlled — the chip itself doesn't
 * own the values.
 *
 * Built directly on react-aria's DialogTrigger + ListBox rather than the
 * existing MultipleSelect primitive because that component bakes in a
 * tag-field-style trigger, which is too heavy for the floating chrome
 * row in a Google-Maps-style layout.
 */
export function FilterChip<Id extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: FilterChipProps<Id>) {
  const count = value.length;
  const isActive = count > 0;

  return (
    <DialogTrigger>
      <Button
        className={twMerge(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg shadow-sm transition-colors',
          'pressed:bg-muted hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-sm',
          isActive ? 'border-fg/40 bg-fg/5 font-medium' : undefined,
        )}
      >
        <span>{label}</span>
        {isActive && (
          <span
            aria-hidden="true"
            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-fg px-1.5 text-[10px] font-semibold text-bg"
          >
            {count}
          </span>
        )}
        <ChevronDownIcon className="size-4 text-muted-fg" />
      </Button>

      <PopoverPrimitive
        offset={6}
        // `bottom start` anchors the popover's left edge to the
        // trigger's left edge instead of center-aligning, so the menu
        // grows down-and-right from the chip rather than spilling over
        // its left side.
        placement="bottom start"
        // Auto-size to content. The styled ListBox imposes a min-w-56
        // (224px) and max-h-96 internally, so we don't need to repeat
        // those constraints here. No `w-(--trigger-width)` — the chip
        // trigger is small and forcing the popover to match it
        // collapses the labels.
        className={twMerge(
          'overflow-hidden rounded-xl shadow-lg',
          'entering:animate-in entering:fade-in-0 entering:zoom-in-95',
          'exiting:animate-out exiting:fade-out-0 exiting:zoom-out-95',
        )}
      >
        <Dialog className="outline-none">
          <ListBox
            aria-label={label}
            selectionMode="multiple"
            selectedKeys={value}
            onSelectionChange={(keys) => {
              if (keys === 'all') onChange(options.map((o) => o.id));
              else onChange(Array.from(keys) as Id[]);
            }}
            items={options}
          >
            {(item) => (
              <ListBoxItem id={item.id} textValue={item.name}>
                {item.name}
              </ListBoxItem>
            )}
          </ListBox>
        </Dialog>
      </PopoverPrimitive>
    </DialogTrigger>
  );
}
