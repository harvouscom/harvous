import { useSyncExternalStore } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { spaceIconAccentHex, avatarGlyphColorForAccent } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import { resolveClerkProfileImageUrl, resolveSpaceMemberProfileImageUrl } from '@/utils/clerk-profile-image';

export interface SharedSpaceMemberAvatarProps {
  userId: string;
  firstName?: string | null;
  displayName: string;
  userColor?: string | null;
  profileImageUrl?: string | null;
  className?: string;
}

/** Member avatar for shared-space rosters — real photo when available, accent initial otherwise. */
export default function SharedSpaceMemberAvatar({
  userId,
  firstName,
  displayName,
  userColor,
  profileImageUrl,
  className,
}: SharedSpaceMemberAvatarProps) {
  const { userId: authUserId } = useAuth();
  const { user } = useUser();
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);

  const photoUrl =
    userId === authUserId
      ? resolveClerkProfileImageUrl(user, profileImageUrl)
      : resolveSpaceMemberProfileImageUrl(profileImageUrl);

  const avatarClass = ['proto-shared-people-row__avatar', className].filter(Boolean).join(' ');

  if (photoUrl) {
    return (
      <span
        className={`${avatarClass} proto-shared-people-row__avatar--photo`}
        aria-hidden
        style={{ backgroundImage: `url(${photoUrl})` }}
      />
    );
  }

  const bg = spaceIconAccentHex(userColor || 'blue', colorScheme);
  return (
    <span
      className={avatarClass}
      aria-hidden
      style={{ background: bg, color: avatarGlyphColorForAccent(bg, colorScheme) ?? undefined }}
    >
      {(firstName || displayName || '?').charAt(0).toUpperCase()}
    </span>
  );
}
