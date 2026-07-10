import { describe, expect, it } from 'vitest';
import { peekPendingAuthRedirect } from '../../../lib/pending-auth-redirect';
import { writePublicToolbarPendingRedirect } from '../public-shared';

describe('public toolbar pending auth redirect', () => {
  it('writes the standardized public destination before sign-in', () => {
    window.history.replaceState({}, '', '/shared/note/AbC123?from=toolbar#open');

    expect(writePublicToolbarPendingRedirect(window.location.href)).toBe(true);
    expect(peekPendingAuthRedirect()).toBe('/shared/note/AbC123?from=toolbar#open');
  });

  it('does not persist a non-public destination', () => {
    expect(writePublicToolbarPendingRedirect(`${window.location.origin}/settings`)).toBe(false);
    expect(peekPendingAuthRedirect()).toBeNull();
  });
});
