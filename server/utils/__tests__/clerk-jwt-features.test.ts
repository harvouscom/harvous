import { describe, expect, it } from 'vitest';
import { jwtHasFeature } from '../clerk-jwt-features';

describe('jwtHasFeature', () => {
  it('matches JWT v2 user-scoped features', () => {
    expect(jwtHasFeature({ fea: 'u:shared_spaces,u:export' }, 'shared_spaces')).toBe(true);
    expect(jwtHasFeature({ fea: 'u:shared_spaces,u:export' }, 'export')).toBe(true);
    expect(jwtHasFeature({ fea: 'u:shared_spaces' }, 'other')).toBe(false);
  });

  it('matches legacy bare feature slugs', () => {
    expect(jwtHasFeature({ fea: 'shared_spaces,export' }, 'shared_spaces')).toBe(true);
  });

  it('matches organization-scoped features', () => {
    expect(jwtHasFeature({ fea: 'o:dashboard,o:teams' }, 'dashboard')).toBe(true);
  });
});
