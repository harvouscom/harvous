import SharedSpaceMemberAvatar from './SharedSpaceMemberAvatar';

/** Author attribution chip for shared-space lists — same avatar treatment as the people roster. */
export default function SharedSpaceNoteAuthorChip({
  displayName,
  userId = '',
  firstName,
  profileImageUrl,
  color,
  isSelf = false,
}: {
  displayName: string;
  userId?: string;
  firstName?: string | null;
  profileImageUrl?: string | null;
  color?: string | null;
  isSelf?: boolean;
}) {
  const label = isSelf ? 'You' : displayName;

  return (
    <span className="proto-shared-author-chip">
      <SharedSpaceMemberAvatar
        userId={userId}
        firstName={firstName}
        displayName={displayName}
        userColor={color}
        profileImageUrl={profileImageUrl}
        className="proto-shared-people-row__avatar--chip"
      />
      {label}
    </span>
  );
}
