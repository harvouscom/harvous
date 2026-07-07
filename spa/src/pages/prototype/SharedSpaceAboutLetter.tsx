/**
 * Read-only join-letter card + named member roster for the shared space about dialog.
 */
import { useAuth } from '@clerk/clerk-react';
import type { SpaceMemberRow } from '../../hooks/queries/useSpace';
import type { PublicJoinSpaceLetterSpace } from '../public/PublicJoinSpaceLetter';
import PublicJoinSpaceLetter from '../public/PublicJoinSpaceLetter';
import { sortMembersForAboutRoster } from '../../lib/shared-space-about';
import SharedSpaceMemberAvatar from './SharedSpaceMemberAvatar';

export interface SharedSpaceAboutLetterProps {
  space: PublicJoinSpaceLetterSpace;
  members: SpaceMemberRow[];
}

export default function SharedSpaceAboutLetter({ space, members }: SharedSpaceAboutLetterProps) {
  const { userId: authUserId } = useAuth();
  const roster = sortMembersForAboutRoster(members);

  return (
    <div className="proto-shared-space-about__letter">
      <PublicJoinSpaceLetter space={space} variant="about" />
      {roster.length > 0 ? (
        <div className="proto-shared-space-about__members">
          <div className="proto-shared-space-about__members-list">
            {roster.map((member) => (
              <div key={member.userId} className="proto-shared-people-row proto-shared-people-row--compact">
                <SharedSpaceMemberAvatar
                  userId={member.userId}
                  firstName={member.firstName}
                  displayName={member.displayName}
                  userColor={member.userColor}
                  profileImageUrl={member.profileImageUrl}
                />
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
