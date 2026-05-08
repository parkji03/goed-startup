/**
 * Address overrides for companies whose `Full Address` field in the CSV is
 * empty or wrong. The seed script applies these before falling back to the
 * CSV value, so re-running `pnpm seed:companies` picks them up automatically.
 *
 * Keys are slugs (the CSV name slugified). When a company name appears more
 * than once in the CSV, the second occurrence gets `-2` appended, etc.
 *
 * Confidence notes:
 *   HIGH    — verified street address from a primary source
 *   MEDIUM  — city + zip from a reliable third-party (Crunchbase, PitchBook)
 *   LOW     — city only; geocodes to centroid
 */
export const ADDRESS_OVERRIDES: Record<string, string> = {
  // HIGH — provided directly
  funner: '10189 N 4800 W, Highland, Utah',

  // LOW — only Salt Lake City confirmed (no street address found in public sources)
  awsm: 'Salt Lake City, UT',

  // MEDIUM — Crunchbase / PitchBook list Midvale
  nomyx: 'Midvale, UT 84047',

  // HIGH — specific address from search
  plotline: '341 South Main Street, Salt Lake City, UT 84111',

  // HIGH — confirmed via Utah Business article + LeadIQ
  parallel: '2701 N Thanksgiving Way Ste 100, Lehi, UT 84045',

  // LOW — sources conflict (Salem/Lehi/Farmington); Salem is the founding city
  'listo-global': 'Salem, UT',

  // MEDIUM — most-cited specific address; some sources say Lehi
  airbatch: '1055 West Painted Horse Lane, Riverton, UT',

  // LOW — Provo confirmed; specific street address in search had a wrong zip
  'solo-2': 'Provo, UT',
};
