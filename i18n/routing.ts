import { defineRouting } from "next-intl/routing"

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  alternateLinks: true,
})

export type AppLocale = (typeof routing.locales)[number]
