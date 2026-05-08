"use client"

import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/20/solid"
import { Button } from "react-aria-components/Button"
import type { InputProps } from "react-aria-components/Input"
import {
  SearchField as SearchFieldPrimitive,
  type SearchFieldProps,
} from "react-aria-components/SearchField"
import { twJoin } from "tailwind-merge"
import { fieldStyles } from "@/components/ui/field"
import { cx } from "@/lib/primitive"
import { Input, InputGroup } from "./input"

export function SearchField({ className, ...props }: SearchFieldProps) {
  return (
    <SearchFieldPrimitive
      data-slot="control"
      {...props}
      aria-label={props["aria-label"] ?? "Search"}
      className={cx(fieldStyles({ className: "group/search-field" }), className)}
    />
  )
}

export function SearchInput(props: InputProps) {
  return (
    <InputGroup
      className={twJoin(
        // Reserve 32px on the right for the X button when the field
        // has text. When it's empty, override the gutter to nearly
        // nothing so the placeholder gets the full width — `hidden`
        // alone wouldn't do it because InputGroup sets the input's
        // right padding via this variable, not via the button's
        // layout presence.
        "[--input-gutter-end:--spacing(8)]",
        "group-data-[empty]/search-field:[--input-gutter-end:--spacing(2)]",
      )}
    >
      <MagnifyingGlassIcon className="in-disabled:opacity-50" />
      <Input {...props} />
      <Button
        className={twJoin(
          // react-aria-components puts `data-empty` on the SearchField
          // root when the input value is "". `hidden` (display: none)
          // both visually hides the button and removes it from the
          // flow, so it doesn't crowd the placeholder.
          "touch-target grid place-content-center pressed:text-fg text-muted-fg hover:text-fg group-data-[empty]/search-field:hidden",
          "px-3 py-2 sm:px-2.5 sm:py-1.5 sm:text-sm/5",
        )}
      >
        <XMarkIcon className="size-5 sm:size-4" />
      </Button>
    </InputGroup>
  )
}
