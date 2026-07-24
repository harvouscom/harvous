/**
 * Clerk is the source of truth for whether the signed-in user has a profile photo.
 * API `profileImageUrl` can lag after delete — do not show a broken <img> for stale URLs.
 */
export type ClerkProfileImageUser = {
  hasImage?: boolean;
  imageUrl?: string | null;
} | null | undefined;

export function resolveClerkProfileImageUrl(
  user: ClerkProfileImageUser,
  profileImageUrl?: string | null,
): string | null {
  if (user?.hasImage && user.imageUrl) return user.imageUrl;
  if (user && user.hasImage === false) return null;
  if (!user && typeof profileImageUrl === 'string' && profileImageUrl.length > 0) {
    return profileImageUrl;
  }
  return null;
}

/** Gravatar/clerk defaults stored in UserMetadata when the user has no real photo. */
export function isPlaceholderProfileImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('gravatar.com')) return false;
    const d = parsed.searchParams.get('d');
    if (d === 'mp' || d === 'identicon' || d === 'monsterid' || d === 'wavatar' || d === 'retro') {
      return true;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    // Bare `/avatar` with no hash is a generic placeholder request.
    return segments.length === 1 && segments[0] === 'avatar';
  } catch {
    return false;
  }
}

export function resolveSpaceMemberProfileImageUrl(url: string | null | undefined): string | null {
  if (isPlaceholderProfileImageUrl(url)) return null;
  return url?.trim() || null;
}
