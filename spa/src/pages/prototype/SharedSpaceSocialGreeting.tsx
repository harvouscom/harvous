/**
 * Home-style social greeting for the shared space dashboard — inline chips for
 * people, notes, and optional live presence.
 */
import Icon from '@/components/react/Icon';
import type { SpacePresenceUser } from '@/hooks/useSpacePresence';
import { formatHomeNoteCount, greetingForHour } from '@/utils/prototype-home-trends';
import type { SharedSpaceSocialIntro } from './shared-space-dashboard';

type Props = {
  selfFirstName: string;
  intro: SharedSpaceSocialIntro;
  presenceOthers: SpacePresenceUser[];
  onOpenNotes: () => void;
  onOpenPeople: () => void;
};

export function sharedSpaceGreetingHello(selfFirstName: string): string {
  const hello = greetingForHour(new Date().getHours());
  const name = selfFirstName.trim();
  return name ? `${hello}, ${name}` : hello;
}

export default function SharedSpaceSocialGreeting({
  selfFirstName,
  intro,
  presenceOthers,
  onOpenNotes,
  onOpenPeople,
}: Props) {
  const hello = sharedSpaceGreetingHello(selfFirstName);

  const notesChip = (
    <button
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--count"
      aria-label="View notes in this space"
      onClick={onOpenNotes}
    >
      <span>{formatHomeNoteCount(intro.totalNoteCount, intro.hasMoreNotes)}</span>
    </button>
  );

  const memberChip = (displayName: string, key: string) => (
    <button
      key={key}
      type="button"
      className="proto-glass-surface proto-home-greeting__chip proto-home-greeting__chip--thread"
      aria-label="View people in this space"
      onClick={onOpenPeople}
    >
      <Icon name="circle-user" size={10} aria-hidden />
      <span>{displayName}</span>
    </button>
  );

  const others = intro.otherContributors;
  const firstOther = others[0];
  const secondOther = others[1];
  const presentOther = presenceOthers[0];

  const joinNames = () => {
    if (!firstOther) return null;
    if (secondOther) {
      return (
        <>
          {memberChip(firstOther.displayName, firstOther.userId ?? firstOther.displayName)}
          {' and '}
          {memberChip(secondOther.displayName, secondOther.userId ?? secondOther.displayName)}
        </>
      );
    }
    return memberChip(firstOther.displayName, firstOther.userId ?? firstOther.displayName);
  };

  let body: React.ReactNode;

  if (presentOther) {
    body = (
      <>
        {memberChip(presentOther.displayName, presentOther.userId)} is here with you
        {intro.totalNoteCount > 0 ? (
          <>
            {' '}
            in a space with {notesChip}
          </>
        ) : (
          '.'
        )}
      </>
    );
  } else if (firstOther && intro.ownRecentCount > 0) {
    body = (
      <>
        You and {joinNames()} share {notesChip} in this space.
      </>
    );
  } else if (firstOther) {
    body = (
      <>
        {memberChip(firstOther.displayName, firstOther.userId ?? firstOther.displayName)} has been studying here
        {intro.totalNoteCount > 0 ? (
          <>
            {' '}
            — {notesChip} so far
          </>
        ) : (
          '.'
        )}
      </>
    );
  } else if (intro.ownRecentCount >= 2) {
    body = (
      <>
        You&apos;ve been adding to {notesChip} here lately.
      </>
    );
  } else if (intro.totalNoteCount > 0) {
    body = <>This shared space has {notesChip}.</>;
  } else {
    return null;
  }

  return (
    <p className="proto-home-greeting">
      <span className="proto-home-greeting__hello">{hello}</span>. {body}
    </p>
  );
}
