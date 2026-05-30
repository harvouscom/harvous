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
