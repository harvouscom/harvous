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

  it('persists /upgrade so pricing → auth → checkout can resume', () => {
    window.history.replaceState({}, '', '/upgrade?from=pricing');

    expect(writePublicToolbarPendingRedirect(window.location.href)).toBe(true);
    expect(peekPendingAuthRedirect()).toBe('/upgrade?from=pricing');
  });
});
