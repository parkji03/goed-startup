/**
 * Global IANA time zone for next-intl formatting (dates/times, relative time).
 * Utah GOED default is Mountain Time; override per deployment if needed.
 * @see https://next-intl.dev/docs/usage/configuration#time-zone
 */
export function appTimeZone(): string {
  return process.env.NEXT_PUBLIC_TIME_ZONE ?? "America/Denver"
}
