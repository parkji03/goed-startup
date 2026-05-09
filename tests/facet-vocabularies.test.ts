import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMMUNITY_VOCAB,
  INDUSTRY_VOCAB,
  LOCATION_VOCAB,
  clampToVocab,
} from '../convex/lib/facetVocabularies';

describe('clampToVocab', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    warn.mockRestore();
  });

  it('keeps values that are in the vocab in original order', () => {
    expect(clampToVocab(['Rural', 'Veteran', 'Women'], COMMUNITY_VOCAB, 'communities')).toEqual([
      'Rural',
      'Veteran',
      'Women',
    ]);
  });

  it('drops values that are not in the vocab and warns once', () => {
    const out = clampToVocab(['Rural', 'rural', 'Mythical', ''], COMMUNITY_VOCAB, 'communities');
    expect(out).toEqual(['Rural']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/communities/);
  });

  it('dedupes within input', () => {
    expect(clampToVocab(['Rural', 'Rural', ' Rural '], COMMUNITY_VOCAB, 'communities')).toEqual([
      'Rural',
    ]);
  });

  it('clamps industries against canonical CSV values', () => {
    expect(
      clampToVocab(
        ['Software and Information Technology', 'Tech', 'Manufacturing'],
        INDUSTRY_VOCAB,
        'industries',
      ),
    ).toEqual(['Software and Information Technology', 'Manufacturing']);
  });

  it('clamps locations against the 29 Utah counties', () => {
    expect(
      clampToVocab(['Salt Lake', 'Provo', 'Washington', 'Foo'], LOCATION_VOCAB, 'locations'),
    ).toEqual(['Salt Lake', 'Washington']);
  });
});

describe('vocab cardinality matches the CSV', () => {
  it('communities = 7', () => {
    expect(COMMUNITY_VOCAB.size).toBe(7);
  });
  it('industries = 10', () => {
    expect(INDUSTRY_VOCAB.size).toBe(10);
  });
  it('locations = 29 (Utah counties)', () => {
    expect(LOCATION_VOCAB.size).toBe(29);
  });
});
