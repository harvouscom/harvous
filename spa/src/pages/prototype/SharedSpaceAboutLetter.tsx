/**
 * Read-only join-letter card + named member roster for the shared space about dialog.
 */
import { useAuth } from '@clerk/clerk-react';
import type { SpaceMemberRow } from '../../hooks/queries/useSpace';
import type { PublicJoinSpaceLetterSpace } from '../public/PublicJoinSpaceLetter';
import PublicJoinSpaceLetter from '../public/PublicJoinSpaceLetter';
import { sortMembersForAboutRoster } from '../../lib/shared-space-about';
import { formatServiceTime } from '../../lib/church-services';
import Icon from '@/components/react/Icon';
import {
  MEETING_KIND_LABELS,
  meetingDayLabel,
  meetingKindHasUrl,
  meetingUrlHost,
  type MeetingKind,
} from '@/utils/space-meeting-rhythm';
import SharedSpaceMemberAvatar from './SharedSpaceMemberAvatar';

export interface SharedSpaceAboutLetterProps {
  space: PublicJoinSpaceLetterSpace;
  members: SpaceMemberRow[];
  /** 0–6, Sunday first — when the room gathers. */
  meetingDay?: number | null;
  /** 'HH:MM' wall clock, no zone. */
  meetingTime?: string | null;
  /** 'in_person' | 'online' | 'hybrid' — where the room meets. */
  meetingKind?: MeetingKind | null;
  /**
   * The room's standing video link.
   *
   * Rendered here and nowhere else that a non-member can reach. This component
   * is the in-space About card; `PublicJoinSpaceLetter` is the invite page and
   * deliberately knows nothing about it, and the unauthenticated
   * `/api/spaces/invite-preview/:token` payload does not carry it. A join link
   * goes to people who are not members yet; this is the key to the room.
   */
  meetingUrl?: string | null;
  /** Leave out the tile-and-name — for a caller whose chrome already names the room. */
  hideMasthead?: boolean;
}

export default function SharedSpaceAboutLetter({
  space,
  members,
  meetingDay = null,
  meetingTime = null,
  meetingKind = null,
  meetingUrl = null,
  hideMasthead = false,
}: SharedSpaceAboutLetterProps) {
  const { userId: authUserId } = useAuth();
  const roster = sortMembersForAboutRoster(members);

  /*
    "Wednesdays · 6:30 PM" — what the room is, said where the room describes
    itself. A day with no hour is still worth saying; an hour with no day is not
    possible (the server refuses it). No zone suffix: a Shared Space with no
    church behind it has no timezone to name.
  */
  const dayLabel = meetingDayLabel(meetingDay);
  const timeLabel = formatServiceTime(meetingTime);
  const placeLabel = meetingKind ? MEETING_KIND_LABELS[meetingKind] : null;
  const rhythmLabel = [dayLabel ? [dayLabel, timeLabel].filter(Boolean).join(' at ') : null, placeLabel]
    .filter(Boolean)
    .join('  ·  ');
  const linkHost = meetingKindHasUrl(meetingKind) ? meetingUrlHost(meetingUrl) : null;

  return (
    <div className="proto-shared-space-about__letter">
      <PublicJoinSpaceLetter space={space} variant="about" hideMasthead={hideMasthead} />
      {rhythmLabel ? (
        <p className="proto-caption proto-shared-space-about__rhythm">{rhythmLabel}</p>
      ) : null}
      {/* The host is named before the click — you should know where a link goes
          before you follow it out of the app. Never auto-opened, never embedded. */}
      {linkHost && meetingUrl ? (
        <a
          className="proto-shared-space-about__meeting-link"
          href={meetingUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="arrow-up-right-from-square" size={11} aria-hidden />
          <span>Join on {linkHost}</span>
        </a>
      ) : null}
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
