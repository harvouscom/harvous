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
 *  - destination — where this note lives, on any note the viewer authored. The one
 *    control that answers "which spaces is this in?", and the one that changes it.
 *  - `quiet` — a *foreign* note that is shared somewhere but has nobody in it, so a
 *    pen/lease banner is noise. One subdued line, no co-edit chrome.
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
 * Precedence is loud → purpose → destination → quiet. Loud always wins because
 * "someone else has the pen" is the only one of these you cannot afford to miss;
 * purpose outranks the rest because it is the thing the author is actively
 * doing, and it disappears for good once dismissed.
 */
export default function PrototypeNoteAudienceBar({
  mode,
  audienceLabel,
  destinationLabel,
  draftDestinationIsHome = false,
  onOpenAudience,
  onOpenDestination,
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
  /**
   * Where this note lives. Compose-tense while drafting ("Saving to My Home"), present
   * tense once it exists ("In My Home, Romans Group"). Null for a foreign note, which
   * falls through to the audience/pen registers below.
   */
  destinationLabel?: string | null;
  /** True when My Home is the only destination — swaps the house icon in for the group one. */
  draftDestinationIsHome?: boolean;
  /** Opens the inspector's Shared-with section. */
  onOpenAudience?: () => void;
  /** Opens the destination picker. Absent = the destination is not the viewer's to change. */
  onOpenDestination?: () => void;
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

  /*
    Where this note lives — on a draft *and* on a saved note.

    This branch used to fire only while composing, so the one control that answers "which
    space is this in?" vanished the moment the note saved, and a note in My Home with no
    shared spaces never showed it at all. It is the destination register for the whole
    life of an authored note now, and the quiet "Shared with …" line below is what a
    *foreign* note falls back to.

    Below `loud`, deliberately. `loud` means someone has the pen or the editor has already
    gone read-only, and that is the one thing here you cannot afford to miss — so this row
    yields the slot rather than stacking under it and jumping the caret mid-sentence. The
    trade is real: inside a co-edit-enabled space the row is unavailable, and the note's
    destinations are managed from My Home instead.
  */
  if (destinationLabel && mode !== 'loud') {
    const icon = draftDestinationIsHome ? (
      <ProtoHouseIcon size={11} className="proto-shared-readonly-banner__icon" />
    ) : (
      <Icon name="user-group" size={11} className="proto-shared-readonly-banner__icon" aria-hidden />
    );

    if (!onOpenDestination) {
      return (
        <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet">
          <span className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption">
            {icon}
            {destinationLabel}
          </span>
        </div>
      );
    }

    return (
      <div className="proto-shared-readonly-banner proto-shared-readonly-banner--quiet">
        <button
          type="button"
          className="proto-shared-readonly-banner__status proto-shared-readonly-banner__audience pds-caption"
          onClick={onOpenDestination}
          // Don't steal focus from the editor — the author is usually mid-sentence.
          onMouseDown={(e) => e.preventDefault()}
          title="Change where this note is saved"
          aria-haspopup="listbox"
        >
          {icon}
          {destinationLabel}
          {/*
            Points down, not right. The audience control below goes *somewhere* — it opens
            the inspector — and a right caret says so. This opens a short menu directly
            beneath itself, and a right caret on it was a small lie about where the tap
            leads, which is the kind that makes a control look decorative and go untried.
          */}
          <Icon
            name="caret-down"
            size={9}
            className="proto-shared-readonly-banner__audience-chevron"
            aria-hidden
          />
        </button>
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
