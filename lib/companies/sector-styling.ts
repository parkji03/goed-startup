import type { SectorId } from './taxonomy';

/**
 * Per-sector visual tint for the company-detail hero plate. Each entry is a
 * Tailwind gradient class pair plus a foreground tint used for the small
 * sector pill on top of the gradient. Kept subtle so the company logo stays
 * the focal point — gradients are wash-grade, not advertisements.
 */
export const SECTOR_TINTS: Record<SectorId, { gradient: string; pill: string }> = {
  'b2b-software':   { gradient: 'from-slate-100 via-indigo-50 to-blue-100',  pill: 'text-indigo-700 bg-indigo-50' },
  'consumer':       { gradient: 'from-rose-50  via-orange-50  to-amber-100', pill: 'text-rose-700   bg-rose-50'   },
  'fintech':        { gradient: 'from-emerald-50 via-teal-50  to-cyan-100',  pill: 'text-emerald-700 bg-emerald-50' },
  'bio-medical':    { gradient: 'from-cyan-50  via-emerald-50 to-lime-100',  pill: 'text-cyan-700   bg-cyan-50'   },
  'security':       { gradient: 'from-zinc-100 via-slate-100  to-stone-200', pill: 'text-zinc-700   bg-zinc-100'  },
  'energy':         { gradient: 'from-amber-50 via-orange-50  to-rose-100',  pill: 'text-amber-800  bg-amber-50'  },
  'marketplaces':   { gradient: 'from-violet-50 via-fuchsia-50 to-pink-100', pill: 'text-violet-700 bg-violet-50' },
  'other':          { gradient: 'from-stone-100 via-stone-50  to-stone-200', pill: 'text-stone-700  bg-stone-100' },
};
