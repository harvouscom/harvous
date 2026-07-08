import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';

/** Owner attribution for shared-space collection empty states — same chip as home cards. */
export default function SharedSpaceOwnerCollectionEmptyDescription({
  resourceLabel,
  ownerDisplayName = 'Space owner',
  ownerUserId = '',
  ownerFirstName,
  ownerProfileImageUrl,
  ownerColor = 'blue',
  ownerIsSelf = false,
}: {
  resourceLabel: 'Threads' | 'Folders';
  ownerDisplayName?: string;
  ownerUserId?: string;
  ownerFirstName?: string | null;
  ownerProfileImageUrl?: string | null;
  ownerColor?: string | null;
  ownerIsSelf?: boolean;
}) {
  return (
    <div className="proto-list-empty-state__owner-attribution">
      <span className="proto-list-empty-state__owner-attribution-lead">
        {resourceLabel} in this space are
      </span>
      <span className="proto-list-empty-state__owner-attribution-row">
        added by{' '}
        <SharedSpaceNoteAuthorChip
          displayName={ownerDisplayName}
          userId={ownerUserId}
          firstName={ownerFirstName}
          profileImageUrl={ownerProfileImageUrl}
          color={ownerColor}
          isSelf={ownerIsSelf}
        />
      </span>
    </div>
  );
}
