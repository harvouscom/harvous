import Icon from '@/components/react/Icon';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';

export default function PrototypeSharedNoteReadOnlyBanner({
  authorDisplayName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
}: {
  authorDisplayName?: string | null;
  authorUserId?: string | null;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor?: string | null;
}) {
  const hasAuthor = Boolean(authorDisplayName && authorUserId);
  return (
    <div className="proto-shared-readonly-banner" role="status" aria-live="polite">
      <span className="proto-shared-readonly-banner__status pds-caption">
        <Icon name="eye" size={11} className="proto-shared-readonly-banner__icon" aria-hidden />
        Can't edit
      </span>
      {hasAuthor ? (
        <SharedSpaceNoteAuthorChip
          displayName={authorDisplayName!}
          userId={authorUserId!}
          firstName={authorFirstName}
          profileImageUrl={authorProfileImageUrl}
          color={authorColor ?? 'blue'}
          isSelf={false}
        />
      ) : null}
    </div>
  );
}
