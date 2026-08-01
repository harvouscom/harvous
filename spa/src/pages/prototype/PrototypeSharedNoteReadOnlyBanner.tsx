import Icon from '@/components/react/Icon';
import SharedSpaceNoteAuthorChip from './SharedSpaceNoteAuthorChip';

/**
 * Status bar for a shared note's editability. Started life as "Editing is off"
 * and now also carries the co-editing pen, because both answer the same question
 * — can I write in this right now, and if not, why not.
 *
 * There is no "Start editing" control: allowed writers claim the pen by typing /
 * selecting in the editor. Done releases early; idle/blur grace also release.
 */
export type SharedNoteEditStatus =
  /** Not co-editable: the author's note, read-only to everyone else. */
  | { kind: 'read-only' }
  /** Read-only because the viewer is offline, not because of permission. */
  | { kind: 'offline' }
  /** Co-editable and nobody is writing — type to take the pen. */
  | { kind: 'available' }
  /** Someone else is writing. */
  | { kind: 'held'; holderName: string }
  /** This viewer holds the pen. */
  | { kind: 'holding' }
  /** Co-editable but the lease channel is down; don't imply the pen is free. */
  | { kind: 'reconnecting' };

function statusCopy(status: SharedNoteEditStatus): { icon: string; label: string } {
  switch (status.kind) {
    case 'offline':
      return { icon: 'eye', label: "Editing is off — you're offline" };
    case 'available':
      return { icon: 'pen', label: 'Open for editing' };
    case 'held':
      return { icon: 'pen', label: `${status.holderName} is writing…` };
    case 'holding':
      return { icon: 'pen', label: "You're editing" };
    case 'reconnecting':
      return { icon: 'eye', label: "Can't connect to live editing" };
    case 'read-only':
    default:
      return { icon: 'eye', label: 'Editing is off' };
  }
}

export default function PrototypeSharedNoteReadOnlyBanner({
  authorDisplayName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
  status = { kind: 'read-only' },
  onReleasePen,
}: {
  authorDisplayName?: string | null;
  authorUserId?: string | null;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor?: string | null;
  status?: SharedNoteEditStatus;
  onReleasePen?: () => void;
}) {
  const hasAuthor = Boolean(authorDisplayName && authorUserId);
  const { icon, label } = statusCopy(status);

  return (
    <div className="proto-shared-readonly-banner" role="status" aria-live="polite">
      <span className="proto-shared-readonly-banner__status pds-caption">
        <Icon name={icon} size={11} className="proto-shared-readonly-banner__icon" aria-hidden />
        {label}
      </span>
      {status.kind === 'holding' && onReleasePen ? (
        <button
          type="button"
          className="proto-shared-readonly-banner__action"
          onClick={onReleasePen}
        >
          Done
        </button>
      ) : hasAuthor ? (
        <SharedSpaceNoteAuthorChip
          displayName={authorDisplayName!}
          userId={authorUserId!}
          firstName={authorFirstName}
          profileImageUrl={authorProfileImageUrl}
          color={authorColor}
          isSelf={false}
          showAvatar={false}
        />
      ) : null}
    </div>
  );
}
