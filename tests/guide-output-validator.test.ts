import { describe, expect, it } from 'vitest';
import { extractCitations, logHallucinatedSlugs } from '../lib/guide/output-validator';

describe('extractCitations', () => {
  it('returns empty array on empty input', () => {
    expect(extractCitations('')).toEqual([]);
  });

  it('extracts a single resource slug', () => {
    expect(extractCitations('Check /resources/utah-innovation-fund for details.')).toEqual([
      { kind: 'resource', slug: 'utah-innovation-fund' },
    ]);
  });

  it('extracts a single guide slug', () => {
    expect(extractCitations('Read /guides/six-things-to-include-in-your-pitch-deck.')).toEqual([
      { kind: 'guide', slug: 'six-things-to-include-in-your-pitch-deck' },
    ]);
  });

  it('extracts both kinds in one pass', () => {
    const text = 'Try /resources/altitude-lab and read /guides/crowdfunding-101.';
    expect(extractCitations(text)).toEqual([
      { kind: 'resource', slug: 'altitude-lab' },
      { kind: 'guide', slug: 'crowdfunding-101' },
    ]);
  });

  it('deduplicates repeated citations within a kind', () => {
    const text = 'See /resources/foo and also /resources/foo for more.';
    expect(extractCitations(text)).toEqual([{ kind: 'resource', slug: 'foo' }]);
  });

  it('keeps same slug across kinds (resource + guide same name = different citations)', () => {
    const text = '/resources/networking and /guides/networking are different things.';
    expect(extractCitations(text)).toEqual([
      { kind: 'resource', slug: 'networking' },
      { kind: 'guide', slug: 'networking' },
    ]);
  });

  it('only matches the resources/guides paths, not arbitrary URLs', () => {
    expect(extractCitations('Check /docs/something for help.')).toEqual([]);
  });

  it('is case-insensitive on the path but normalizes slug to lowercase', () => {
    expect(extractCitations('See /Resources/Foo here.')).toEqual([
      { kind: 'resource', slug: 'foo' },
    ]);
  });
});

describe('logHallucinatedSlugs', () => {
  it('returns empty when every emitted citation is in context', () => {
    const bad = logHallucinatedSlugs({
      modelText: 'See /resources/foo and /guides/bar.',
      contextResourceSlugs: ['foo'],
      contextGuideSlugs: ['bar'],
      hashedIp: 'test',
    });
    expect(bad).toEqual([]);
  });

  it('flags resource slugs not in context', () => {
    const bad = logHallucinatedSlugs({
      modelText: 'See /resources/foo and /resources/baz.',
      contextResourceSlugs: ['foo'],
      contextGuideSlugs: [],
      hashedIp: 'test',
    });
    expect(bad).toEqual([{ kind: 'resource', slug: 'baz' }]);
  });

  it('flags guide slugs not in context', () => {
    const bad = logHallucinatedSlugs({
      modelText: 'Read /guides/missing.',
      contextResourceSlugs: [],
      contextGuideSlugs: ['known'],
      hashedIp: 'test',
    });
    expect(bad).toEqual([{ kind: 'guide', slug: 'missing' }]);
  });

  it('does not cross-pollute kinds (a guide slug listed in resources context is still hallucinated)', () => {
    const bad = logHallucinatedSlugs({
      modelText: 'Read /guides/networking.',
      contextResourceSlugs: ['networking'],
      contextGuideSlugs: [],
      hashedIp: 'test',
    });
    expect(bad).toEqual([{ kind: 'guide', slug: 'networking' }]);
  });
});
