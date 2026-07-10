import { describe, expect, it } from 'vitest';
import {
  definedEnvironment,
  PROTECTED_SHARED_SPACES_SPECS,
  playwrightTestIgnore,
} from '../../../playwright.config';

describe('Playwright suite selection', () => {
  it('excludes every fail-closed Shared Spaces release spec from generic runs', () => {
    expect(playwrightTestIgnore(false)).toEqual(
      expect.arrayContaining([...PROTECTED_SHARED_SPACES_SPECS]),
    );
  });

  it('allows protected specs only when the release gate is enabled', () => {
    const protectedIgnore = playwrightTestIgnore(true);
    for (const spec of PROTECTED_SHARED_SPACES_SPECS) {
      expect(protectedIgnore).not.toContain(spec);
    }
    expect(protectedIgnore).toContain('**/invitation-accept.spec.ts');
  });

  it('passes only defined strings to the Playwright web server', () => {
    expect(
      definedEnvironment({
        DEFINED: 'value',
        EMPTY: '',
        UNDEFINED: undefined,
      }),
    ).toEqual({
      DEFINED: 'value',
      EMPTY: '',
    });
  });
});
