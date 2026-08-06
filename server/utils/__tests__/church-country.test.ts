import { describe, expect, it } from 'vitest';
import { deriveChurchCountry } from '../church-country';

describe('deriveChurchCountry', () => {
  it('fills a missing country from the region', () => {
    // The case that left every existing row empty: state known, country not.
    expect(deriveChurchCountry(null, 'IA')).toBe('US');
    expect(deriveChurchCountry(undefined, 'ON')).toBe('CA');
    expect(deriveChurchCountry('', 'TX')).toBe('US');
  });

  it('never overrides a country someone supplied', () => {
    // A church outside HMC's region coverage must still be able to say where
    // it is, even when the mapper would disagree.
    expect(deriveChurchCountry('GB', 'IA')).toBe('GB');
    expect(deriveChurchCountry('PH', null)).toBe('PH');
    expect(deriveChurchCountry('United Kingdom', 'IA')).toBe('United Kingdom');
  });

  it('normalizes a two-letter code so casing cannot fork the data', () => {
    expect(deriveChurchCountry('us', null)).toBe('US');
    expect(deriveChurchCountry('  gb  ', null)).toBe('GB');
  });

  it('returns null rather than guessing from an unknown region', () => {
    expect(deriveChurchCountry(null, 'ZZ')).toBeNull();
    expect(deriveChurchCountry(null, null)).toBeNull();
    expect(deriveChurchCountry(null, '')).toBeNull();
  });

  it('agrees with what an HMC-linked church would already store', () => {
    // hmcDenormFields uses the same mapper, so a derived country and a linked
    // one can never disagree for the same region.
    expect(deriveChurchCountry(null, 'IA')).toBe(deriveChurchCountry(null, 'ia'));
  });
});
