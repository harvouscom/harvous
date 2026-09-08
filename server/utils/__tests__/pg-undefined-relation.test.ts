import { describe, expect, it } from 'vitest';
import { isDiscoverTableMissing, isPgUndefinedRelation } from '../pg-undefined-relation';

describe('isDiscoverTableMissing', () => {
  it('recognizes a missing catalog table through a Drizzle wrapper', () => {
    const cause = Object.assign(new Error('relation "DiscoverListings" does not exist'), {
      code: '42P01',
    });
    const wrapped = new Error('Failed query: select "id" from "DiscoverListings"');
    (wrapped as Error & { cause: unknown }).cause = cause;
    expect(isDiscoverTableMissing(wrapped)).toBe(true);
    expect(isDiscoverTableMissing(cause)).toBe(true);
  });

  it('does not treat a different missing table as Discover', () => {
    const error = Object.assign(new Error('relation "ReviewItems" does not exist'), { code: '42P01' });
    expect(isDiscoverTableMissing(error)).toBe(false);
    expect(isPgUndefinedRelation(error, 'ReviewItems')).toBe(true);
  });
});
