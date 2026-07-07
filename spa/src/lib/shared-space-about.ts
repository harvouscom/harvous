import { appearanceAccentForThreadColor } from '@/utils/space-cover';
import { resolveSpaceMemberProfileImageUrl } from './clerk-profile-image';
import type { SpaceDetail, SpaceMemberRow } from '../hooks/queries/useSpace';
import type { PublicJoinSpaceLetterSpace } from '../pages/public/PublicJoinSpaceLetter';

function memberInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.charAt(0).toUpperCase();
}

/** Map live space + members API data to join-letter shape for the about dialog. */
export function mapSpaceToAboutLetterSpace(
  space: SpaceDetail,
  members: SpaceMemberRow[],
): PublicJoinSpaceLetterSpace {
  const owner =
    members.find((m) => m.role === 'owner') ??
    members.find((m) => m.userId === space.ownerId) ??
    members[0];
  const nonOwner = members.filter((m) => m.userId !== owner?.userId).slice(0, 2);

  const accentForColor = (color: string | null | undefined) => {
    const c = color || 'blue';
    return {
      accentLight: appearanceAccentForThreadColor(c, 'light'),
      accentDark: appearanceAccentForThreadColor(c, 'dark'),
    };
  };

  const ownerAccent = owner ? accentForColor(owner.userColor) : accentForColor(space.color);

  return {
    id: space.id,
    title: space.title,
    color: space.color ?? undefined,
    backgroundGradient: space.backgroundGradient,
    cover: {
      light: space.coverBgLight ?? null,
      dark: space.coverBgDark ?? null,
    },
    description: space.description ?? undefined,
    ownerDisplayName: owner?.displayName ?? 'Space owner',
    ownerProfileImageUrl: resolveSpaceMemberProfileImageUrl(owner?.profileImageUrl),
    ownerAccentLight: ownerAccent.accentLight,
    ownerAccentDark: ownerAccent.accentDark,
    isHarvousOwned: false,
    memberCount: members.length > 0 ? members.length : Math.max(space.memberCount ?? 0, 1),
    memberPreviews: nonOwner.map((m) => {
      const accent = accentForColor(m.userColor);
      return {
        initial: memberInitial(m.displayName || m.firstName || '?'),
        accentLight: accent.accentLight,
        accentDark: accent.accentDark,
      };
    }),
    isAlreadyMember: true,
  };
}

/** Owner first, then alphabetical by display name. */
export function sortMembersForAboutRoster(members: SpaceMemberRow[]): SpaceMemberRow[] {
  return [...members].sort((a, b) => {
    if (a.role === 'owner' && b.role !== 'owner') return -1;
    if (b.role === 'owner' && a.role !== 'owner') return 1;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });
}
