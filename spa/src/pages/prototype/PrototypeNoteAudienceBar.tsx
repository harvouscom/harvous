import Icon from '@/components/react/Icon';
import PrototypeSharedNoteReadOnlyBanner, {
  type SharedNoteEditStatus,
} from './PrototypeSharedNoteReadOnlyBanner';
import type { NoteEditStatusVisibility } from '../../lib/note-audience';

/**
 * The one slot above the note body that answers "who else can see this, and can I
 * write in it right now".
 *
 * Two registers, deliberately sharing the same DOM slot and height:
 *
 *  - `quiet` — reading your own note in My Home. It's shared somewhere, but nobody
 *    is in it, so a pen/lease banner is noise. One subdued line, no co-edit chrome.
 *  - `loud`  — you're in the shared space, or someone actually has the pen. Full
 *    status banner.
 *
 * Escalation happens mid-typing, so quiet and loud must occupy identical space:
 * both render `.proto-shared-readonly-banner` with its fixed `min-height`, and the
 * quiet variant only swaps colour and adds a chevron. Any layout shift here would
 * jump the caret at the exact moment a collaborator starts writing.
 */
export default function PrototypeNoteAudienceBar({
  mode,
  audienceLabel,
  draftDestinationLabel,
  onOpenAudience,
  authorDisplayName,
  authorUserId,
  authorFirstName,
  authorProfileImageUrl,
  authorColor,
  isAuthorSelf = false,
  status = { kind: 'read-only' },
  onReleasePen,
}: {
  mode: NoteEditStatusVisibility;
  /** Copy for the quiet register, e.g. "Shared with Romans Group". */
  audienceLabel?: string | null;
  /** While composing: where this draft will land, e.g. "Saving to My Home". */
  draftDestinationLabel?: string | null;
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
}) {
  // A draft has no audience yet — it has a destination. Same slot, so the bar
  // doesn't appear out of nowhere the moment the note saves.
  if (draftDestinationLabel) {
    return (
      <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet">
        <span className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption">
          <Icon
            name="user-group"
            size={11}
            className="proto-shared-readonly-banner__icon"
            aria-hidden
          />
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
