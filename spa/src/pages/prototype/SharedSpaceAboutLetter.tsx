/**
 * Read-only join-letter card + named member roster for the shared space about dialog.
 */
import { useSyncExternalStore } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { spaceIconAccentHex, avatarGlyphColorForAccent } from '@/utils/space-cover';
import { getColorSchemeSnapshot, subscribeColorScheme } from '../../lib/prototype-background';
import type { SpaceMemberRow } from '../../hooks/queries/useSpace';
import type { PublicJoinSpaceLetterSpace } from '../public/PublicJoinSpaceLetter';
import PublicJoinSpaceLetter from '../public/PublicJoinSpaceLetter';
import { sortMembersForAboutRoster } from '../../lib/shared-space-about';

export interface SharedSpaceAboutLetterProps {
  space: PublicJoinSpaceLetterSpace;
  members: SpaceMemberRow[];
}

export default function SharedSpaceAboutLetter({ space, members }: SharedSpaceAboutLetterProps) {
  const { userId: authUserId } = useAuth();
  const colorScheme = useSyncExternalStore(subscribeColorScheme, getColorSchemeSnapshot, () => 'light' as const);
  const roster = sortMembersForAboutRoster(members);

  const memberAvatarStyle = (color?: string | null): React.CSSProperties => {
    const bg = spaceIconAccentHex(color || 'blue', colorScheme);
    return { background: bg, color: avatarGlyphColorForAccent(bg, colorScheme) ?? undefined };
  };

  return (
    <div className="proto-shared-space-about__letter">
      <PublicJoinSpaceLetter space={space} variant="about" />
      {roster.length > 0 ? (
        <div className="proto-shared-space-about__members">
          <div className="proto-shared-space-about__members-list">
            {roster.map((member) => (
              <div key={member.userId} className="proto-shared-people-row proto-shared-people-row--compact">
                {member.profileImageUrl ? (
                  <span
                    className="proto-shared-people-row__avatar proto-shared-people-row__avatar--photo"
                    aria-hidden
                    style={{ backgroundImage: `url(${member.profileImageUrl})` }}
                  />
                ) : (
                  <span className="proto-shared-people-row__avatar" aria-hidden style={memberAvatarStyle(member.userColor)}>
                    {(member.firstName || member.displayName || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="proto-shared-people-row__name">{member.displayName}</span>
                {member.userId === authUserId ? <span className="proto-shared-people-row__tag">You</span> : null}
                {member.role === 'owner' ? (
                  <span className="proto-shared-people-row__tag proto-shared-people-row__tag--owner">Owner</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
