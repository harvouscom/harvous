import Icon from '@/components/react/Icon';
import ProtoHouseIcon from './ProtoHouseIcon';
import PrototypeSharedNoteReadOnlyBanner, {
  type SharedNoteEditStatus,
} from './PrototypeSharedNoteReadOnlyBanner';
import type { NoteEditStatusVisibility } from '../../lib/note-audience';
import type { NotePurpose } from '../../lib/compose-purpose';

/**
 * The one slot above the note body that answers "who else can see this, and can I
 * write in it right now".
 *
 * Registers, deliberately sharing the same DOM slot and height:
 *
 *  - `quiet` — reading your own note in My Home. It's shared somewhere, but nobody
 *    is in it, so a pen/lease banner is noise. One subdued line, no co-edit chrome.
 *  - `loud`  — you're in the shared space, or someone actually has the pen. Full
 *    status banner.
 *  - purpose — what this note is *for*, when the author opened it to do a
 *    particular job (writing into a planned week, or writing a template).
 *
 * Escalation happens mid-typing, so every register must occupy identical space:
 * all render `.proto-shared-readonly-banner` with its fixed `min-height`, and the
 * quiet and purpose variants only swap colour and trailing affordance. Any layout
 * shift here would jump the caret at the exact moment a collaborator starts writing.
 *
 * Precedence is loud → purpose → destination/quiet. Loud always wins because
 * "someone else has the pen" is the only one of these you cannot afford to miss;
 * purpose outranks the other two because it is the thing the author is actively
 * doing, and it disappears for good once dismissed.
 */
export default function PrototypeNoteAudienceBar({
  mode,
  audienceLabel,
  draftDestinationLabel,
  draftDestinationIsHome = false,
  onOpenAudience,
  authorDisplayName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
  isAuthorSelf = false,
  status = { kind: 'read-only' },
  onReleasePen,
  purpose = null,
  onPurposeAction,
  onDismissPurpose,
}: {
  mode: NoteEditStatusVisibility;
  /** Copy for the quiet register, e.g. "Shared with Romans Group". */
  audienceLabel?: string | null;
  /** While composing: where this draft will land, e.g. "Saving to My Home". */
  draftDestinationLabel?: string | null;
  /** True when the draft's destination is My Home — swaps the house icon in for the shared-space one. */
  draftDestinationIsHome?: boolean;
  /** Opens the inspector's Shared-with section. */
  onOpenAudience?: () => void;
  authorDisplayName?: string | null;
  authorUserId?: string | null;
  authorFirstName?: string | null;
  authorProfileImageUrl?: string | null;
  authorColor?: string | null;
  isAuthorSelf?: boolean;
  status?: SharedNoteEditStatus;
  onReleasePen?: () => void;
  /** What this note is for, from `notePurposeModel`. Null for almost every note. */
  purpose?: NotePurpose | null;
  /** Runs the purpose's one action, e.g. opening the templates panel. */
  onPurposeAction?: () => void;
  onDismissPurpose?: () => void;
}) {
  /*
    Purpose sits above the destination and audience lines but below `loud`.
    Checked before the draft branch because a draft is exactly where the
    template purpose lives — a template has no destination worth naming yet.
  */
  if (purpose && mode !== 'loud') {
    return (
      <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet proto-purpose-banner">
        <span className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption">
          <Icon
            name={purpose.kind === 'template' ? 'file-lines' : 'church'}
            size={11}
            className="proto-shared-readonly-banner__icon"
            aria-hidden
          />
          {purpose.label}
        </span>
        <span className="proto-purpose-banner__actions">
          {purpose.actionLabel && onPurposeAction ? (
            <button
              type="button"
              className="proto-purpose-banner__action pds-caption"
              onClick={onPurposeAction}
              // Don't steal focus from the editor — the author is mid-sentence.
              onMouseDown={(e) => e.preventDefault()}
            >
              {purpose.actionLabel}
            </button>
          ) : null}
          {onDismissPurpose ? (
            <button
              type="button"
              className="proto-purpose-banner__dismiss"
              aria-label="Dismiss"
              title="This is just a note"
              onClick={onDismissPurpose}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Icon name="xmark" size={10} aria-hidden />
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  // A draft has no audience yet — it has a destination. Same slot, so the bar
  // doesn't appear out of nowhere the moment the note saves.
  if (draftDestinationLabel) {
    return (
      <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet">
        <span className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption">
          {draftDestinationIsHome ? (
            <ProtoHouseIcon size={11} className="proto-shared-readonly-banner__icon" />
          ) : (
            <Icon
              name="user-group"
              size={11}
              className="proto-shared-readonly-banner__icon"
              aria-hidden
            />
          )}
          {draftDestinationLabel}
        </span>
      </div>
    );
  }

  if (mode === 'hidden') return null;

  if (mode === 'quiet') {
    if (!audienceLabel) return null;
    return (
      <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet">
        <button
          type="button"
          className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption"
          onClick={onOpenAudience}
          // Don't steal focus from the editor — the author is usually mid-sentence.
          onMouseDown={(e) => e.preventDefault()}
          title="Open note details to change who this is shared with"
        >
          <Icon
            name="user-group"
            size={11}
            className="proto-shared-readonly-banner__icon"
            aria-hidden
          />
          {audienceLabel}
          <Icon
            name="caret-right"
            size={9}
            className="proto-shared-readonly-banner__audience-chevron"
            aria-hidden
          />
        </button>
      </div>
    );
  }

  return (
    <PrototypeSharedNoteReadOnlyBanner
      authorDisplayName={authorDisplayName}
      authorUserId={authorUserId}
      authorFirstName={authorFirstName}
      authorProfileImageUrl={authorProfileImageUrl}
      authorColor={authorColor}
      isAuthorSelf={isAuthorSelf}
      status={status}
      onReleasePen={onReleasePen}
    />
  );
}
