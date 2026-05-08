/**
 * Manual founded-year overrides for companies the auto-extractor
 * (scripts/find-founded-years.py) couldn't resolve, or where its result is
 * suspect. The seed script applies these on top of the value parsed from the
 * augmented CSV, so re-running the extractor won't clobber a manual fix.
 *
 * Keys are slugs (the CSV name slugified). When a company name appears more
 * than once in the CSV, the second occurrence gets `-2` appended, etc.
 */
export const FOUNDED_YEAR_OVERRIDES: Record<string, number> = {
  jipe: 2019,
  roger: 2021,
  redo: 2023,
  'the-picklr': 2021,
  'built-for-teams': 2014,
  'elektrik-app-inc': 2019,
  'canopy-tax': 2014,
  'blue-eye': 2020,
  'nodal-power-inc': 2021,
  spaceagent: 2023,
  moneta: 2023,
  driven: 2023,
  signalhero: 2023,
  avy: 2026,
  streamos: 2021,
  applause: 2018,
  gauge: 2016,
  'thymeless-enterprises': 2021,
  'guard-iq': 2022,
};
