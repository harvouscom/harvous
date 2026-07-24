import { describe, expect, it } from 'vitest';
import {
  isPlaceholderProfileImageUrl,
  resolveClerkProfileImageUrl,
  resolveSpaceMemberProfileImageUrl,
} from '../clerk-profile-image';

describe('isPlaceholderProfileImageUrl', () => {
  it('treats gravatar mystery-person defaults as placeholders', () => {
    expect(isPlaceholderProfileImageUrl('https://www.gravatar.com/avatar?d=mp')).toBe(true);
    expect(isPlaceholderProfileImageUrl('https://gravatar.com/avatar?d=identicon')).toBe(true);
  });

  it('keeps real gravatar hashes', () => {
    expect(isPlaceholderProfileImageUrl('https://www.gravatar.com/avatar/abc123?s=200')).toBe(false);
  });
});

describe('resolveSpaceMemberProfileImageUrl', () => {
  it('returns null for placeholder URLs', () => {
    expect(resolveSpaceMemberProfileImageUrl('https://www.gravatar.com/avatar?d=mp')).toBeNull();
  });

  it('returns real URLs unchanged', () => {
    expect(resolveSpaceMemberProfileImageUrl('https://img.clerk.com/photo.jpg')).toBe('https://img.clerk.com/photo.jpg');
  });
});

describe('resolveClerkProfileImageUrl', () => {
  it('returns null when Clerk says the user has no image', () => {
    expect(resolveClerkProfileImageUrl({ hasImage: false, imageUrl: 'https://example.com/stale.jpg' }, null)).toBeNull();
  });
});
