import { describe, expect, it } from 'vitest';
import { extractSlugs } from '../lib/guide/output-validator';

describe('extractSlugs', () => {
  it('returns empty array on empty input', () => {
    expect(extractSlugs('')).toEqual([]);
  });

  it('extracts a single slug', () => {
    expect(extractSlugs('Check /resources/utah-innovation-fund for details.')).toEqual([
      'utah-innovation-fund',
    ]);
  });

  it('deduplicates repeated slugs', () => {
    const text = 'See /resources/foo and also /resources/foo for more.';
    expect(extractSlugs(text)).toEqual(['foo']);
  });

  it('extracts multiple distinct slugs', () => {
    const text = 'Try /resources/a and /resources/b-c.';
    expect(extractSlugs(text)).toEqual(['a', 'b-c']);
  });

  it('only matches the resources path, not arbitrary URLs', () => {
    expect(extractSlugs('Check /docs/guide for help.')).toEqual([]);
  });

  it('is case-insensitive on the path but normalizes slug to lowercase', () => {
    expect(extractSlugs('See /Resources/Foo here.')).toEqual(['foo']);
  });
});
