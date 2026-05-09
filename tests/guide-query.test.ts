import { describe, expect, it } from 'vitest';
import {
  expandQuery,
  filterByProfileSignal,
  rankWithProfile,
  synthesizeQueryFromProfile,
  validateRetrievalInput,
} from '../convex/lib/guideQuery';
import type { FounderProfileConvex } from '../convex/founderProfile';

const emptyProfile: FounderProfileConvex = {
  industries: [],
  stages: [],
  goals: [],
  audiences: [],
  counties: [],
  specialStatuses: [],
  freeText: '',
};

describe('validateRetrievalInput', () => {
  it('accepts a normal query', () => {
    expect(validateRetrievalInput('how do I get pre-seed funding')).toEqual({
      ok: true,
      query: 'how do I get pre-seed funding',
    });
  });

  it('rejects queries longer than 2000 chars', () => {
    const long = 'a'.repeat(2001);
    const result = validateRetrievalInput(long);
    expect(result.ok).toBe(false);
  });

  it('strips control characters', () => {
    const dirty = 'hello\x00\x07\x1Fworld';
    const result = validateRetrievalInput(dirty);
    expect(result).toEqual({ ok: true, query: 'helloworld' });
  });

  it('trims whitespace', () => {
    expect(validateRetrievalInput('  hi  ')).toEqual({ ok: true, query: 'hi' });
  });

  it('returns ok with empty query when input is only whitespace', () => {
    expect(validateRetrievalInput('   ')).toEqual({ ok: true, query: '' });
  });
});

describe('expandQuery', () => {
  it('lowercases and strips punctuation', () => {
    expect(expandQuery('Pre-Seed FUNDING!?', emptyProfile)).toBe('pre-seed funding');
  });

  it('collapses runs of whitespace', () => {
    expect(expandQuery('  hello   world  ', emptyProfile)).toBe('hello world');
  });

  it('does not inject profile terms (profile influence lives in rank/filter, not retrieval)', () => {
    const profile: FounderProfileConvex = {
      ...emptyProfile,
      industries: ['agtech'],
      stages: ['pre-seed'],
      counties: ['davis'],
      audiences: ['rural'],
    };
    expect(expandQuery('funding', profile)).toBe('funding');
  });
});

describe('synthesizeQueryFromProfile', () => {
  it('returns empty string for an empty profile', () => {
    expect(synthesizeQueryFromProfile(emptyProfile)).toBe('');
  });

  it('joins industry, stage, county terms', () => {
    const profile: FounderProfileConvex = {
      ...emptyProfile,
      industries: ['agtech'],
      stages: ['pre-seed'],
      counties: ['davis'],
    };
    const synth = synthesizeQueryFromProfile(profile);
    expect(synth).toContain('agtech');
    expect(synth).toContain('pre-seed');
    expect(synth).toContain('davis');
  });
});

describe('rankWithProfile', () => {
  const baseHit = {
    resourceId: 'r1' as never,
    title: 'X',
    slug: 'x',
    url: 'https://x',
    description: '',
    category: 'capital-funding' as const,
    tags: ['pre-seed'],
    industries: ['agtech'],
    communities: [],
    locations: ['davis'],
    stageTags: ['pre-seed'],
  };

  it('ranks a profile-matching hit above a non-matching hit', () => {
    const profile: FounderProfileConvex = {
      ...emptyProfile,
      industries: ['agtech'],
      stages: ['pre-seed'],
      counties: ['davis'],
    };
    const matching = baseHit;
    const nonMatching = { ...baseHit, slug: 'y', industries: ['fintech'], locations: ['salt-lake'], stageTags: ['series-a'] };
    const ranked = rankWithProfile([nonMatching, matching], profile);
    expect(ranked[0].slug).toBe('x');
  });

  it('preserves order on tie (stable sort)', () => {
    const a = { ...baseHit, slug: 'a' };
    const b = { ...baseHit, slug: 'b' };
    const ranked = rankWithProfile([a, b], emptyProfile);
    expect(ranked.map((r) => r.slug)).toEqual(['a', 'b']);
  });
});

describe('filterByProfileSignal', () => {
  const baseHit = {
    resourceId: 'r1' as never,
    title: 'X',
    slug: 'x',
    url: 'https://x',
    description: '',
    category: 'capital-funding' as const,
    tags: ['pre-seed'],
    industries: ['agtech'],
    communities: [],
    locations: ['davis'],
    stageTags: ['pre-seed'],
  };

  it('keeps every hit when the profile is empty (no scoring signal)', () => {
    const hits = [
      { ...baseHit, slug: 'a' },
      { ...baseHit, slug: 'b', industries: ['fintech'] },
      { ...baseHit, slug: 'c', industries: ['bio'] },
    ];
    expect(filterByProfileSignal(hits, emptyProfile).map((h) => h.slug)).toEqual(['a', 'b', 'c']);
  });

  it('drops zero-score hits when at least one hit matches the profile', () => {
    const profile: FounderProfileConvex = {
      ...emptyProfile,
      industries: ['agtech'],
    };
    const matching = { ...baseHit, slug: 'a' };
    const nonMatching = { ...baseHit, slug: 'b', industries: ['fintech'] };
    const filtered = filterByProfileSignal([matching, nonMatching], profile);
    expect(filtered.map((h) => h.slug)).toEqual(['a']);
  });

  it('falls back to all hits when none match the profile', () => {
    const profile: FounderProfileConvex = {
      ...emptyProfile,
      industries: ['bio'],
    };
    const a = { ...baseHit, slug: 'a' };
    const b = { ...baseHit, slug: 'b' };
    const filtered = filterByProfileSignal([a, b], profile);
    expect(filtered.map((h) => h.slug)).toEqual(['a', 'b']);
  });
});
