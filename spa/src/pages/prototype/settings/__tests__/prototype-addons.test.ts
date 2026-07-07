import { describe, expect, it } from 'vitest';
import { resolveSharedSpacesAddonBadge } from '../PrototypeAddonsPage';

describe('resolveSharedSpacesAddonBadge', () => {
  it('shows Active when the add-on is subscribed', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: true, memberOfCount: 2 })).toBe('Active');
  });

  it('shows member count when joined but not subscribed', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 1 })).toBe('In 1 space');
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 3 })).toBe('In 3 spaces');
  });

  it('shows no badge when not subscribed and not in any shared space', () => {
    expect(resolveSharedSpacesAddonBadge({ hasSharedSpaces: false, memberOfCount: 0 })).toBeUndefined();
  });
});
