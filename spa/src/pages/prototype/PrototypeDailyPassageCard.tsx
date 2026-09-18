/**
 * Today's passage, with its words, at the top of Activity.
 *
 * The row it replaces sat first in Suggested — the last section, below the fold on a phone —
 * and showed only a reference, so the passage was something you had to go and fetch before
 * you could decide whether it spoke to you. This puts the words where the day starts, in the
 * shape the review sample already uses for a verse on Home: a caption line, the text in the
 * reading face, two labelled buttons.
 *
 * It is here until you act on it. Opening it in the reader or writing about it — here or on
 * another device — folds it down to the row in Suggested for the rest of the day, and Continue
 * gets the top back once the passage has done its job. "Not today" hides both, as it always has.
 */
import { useMemo } from 'react';
import Icon from '@/components/react/Icon';
import { TRANSLATIONS } from '@/data/translations';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { VotdToday } from '../../lib/votd-today';
import PrototypeHomeSection from './PrototypeHomeSection';
import { useDailyPassageActions } from './use-daily-passage-actions';

export const DAILY_PASSAGE_SECTION_TITLE = 'Today’s passage';

/** Whether today's passage takes the card at the top (true) or the row in Suggested (false). */
export function dailyPassageShowsCard(votd: VotdToday | null | undefined): boolean {
  return Boolean(votd?.textHtml?.trim()) && votd?.actedToday !== true;
}

export default function PrototypeDailyPassageCard({
  homeSpaceId,
  notes,
  votd,
}: {
  homeSpaceId: string | null;
  notes: SpaceNoteRow[];
  votd: VotdToday;
}) {
  const { hidden, todaysNote, openInReader, takeNote, dismiss } = useDailyPassageActions({
    homeSpaceId,
    notes,
    votd,
  });
  /* A stable object: an inline `{ __html }` re-applies innerHTML on every render, which drops
     any text selection the reader is making in the passage. */
  const markup = useMemo(() => ({ __html: votd.textHtml ?? '' }), [votd.textHtml]);

  if (!homeSpaceId || hidden) return null;

  const translationLabel = TRANSLATIONS[votd.translation]?.abbreviation ?? votd.translation;

  return (
    <PrototypeHomeSection title={DAILY_PASSAGE_SECTION_TITLE}>
      {/* The reminder link scrolls to this anchor, whichever shape the passage is in. */}
      <div className="proto-daily-passage" id="todays-passage">
        <div className="proto-daily-passage__head">
          <p className="proto-caption proto-daily-passage__eyebrow">
            {votd.reference} · {translationLabel}
          </p>
          <button
            type="button"
            className="proto-side-panel__action-btn"
            aria-label="Dismiss today's passage"
            title="Not today"
            onClick={dismiss}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
        <p
          className="proto-review-dock__verse proto-review-dock__verse--scripture"
          dangerouslySetInnerHTML={markup}
        />
        <div className="proto-review-dock__actions">
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--compact"
            onClick={openInReader}
          >
            Open in Bible reader
          </button>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
            onClick={takeNote}
          >
            {todaysNote ? 'Open your note' : 'Take note'}
          </button>
        </div>
      </div>
    </PrototypeHomeSection>
  );
}
