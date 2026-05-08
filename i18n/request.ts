import { getRequestConfig } from "next-intl/server"
import { routing } from "./routing"
import { appTimeZone } from "./time-zone"

const locales = routing.locales as readonly string[]

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale
  if (!locale || !locales.includes(locale)) {
    locale = routing.defaultLocale
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: appTimeZone(),
  }
})
