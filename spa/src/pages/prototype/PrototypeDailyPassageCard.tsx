/**
 * Today's passage, with its words, at the top of Activity.
 *
 * The row it replaces sat first in Suggested — the last section, below the fold on a phone —
 * and showed only a reference, so the passage was something you had to go and fetch before
 * you could decide whether it spoke to you. This puts the words where the day starts.
 *
 * An epigraph (Nov 2026). The words come first, large, in the reading face, under a soft
 * opening quote mark; the reference signs them underneath with the translation as the Scripture
 * dock's own chip, and the two buttons sit on that same line. Derek picked it over a margin
 * column and a running head, after the day's sky (a painting of the hour behind the reference)
 * and four paper and glass headers all read as decoration rather than as a different card. It
 * is the only card on Home that leads with something other than its own title.
 *
 * It is here until you act on it. Opening it in the reader or writing about it — here or on
 * another device — folds it down to the row in Suggestions for the rest of the day. "Not
 * today" hides both, as it always has.
 */
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Icon from '@/components/react/Icon';
import { TRANSLATIONS } from '@/data/translations';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { VotdToday } from '../../lib/votd-today';
import { useDailyPassageActions } from './use-daily-passage-actions';

export const DAILY_PASSAGE_SECTION_TITLE = 'Today’s passage';
/** A Catholic reader's card: the day's Mass Gospel in the passage's place, the same card. */
export const DAILY_GOSPEL_SECTION_TITLE = 'Today’s Gospel';

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

  /*
   * A day's verse is a line or two; a Gospel can be fifteen. Long words fold to the height a
   * verse takes and fade out, and tapping them opens the rest — no extra row, no extra words.
   * Measured, not guessed from length: only text that actually overflows folds and presses.
   * Once open it stays open, so selecting a phrase in it never folds it back.
   */
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [markup, expanded]);

  if (!homeSpaceId || hidden) return null;

  const translation = TRANSLATIONS[votd.translation];
  const noteActionLabel = todaysNote ? 'Open your note' : 'Create note';
  /* A Catholic's day: the Mass Gospel is the passage. The same card in every other way — the
     other readings are a tap away in the reader, not chips crowding the words. */
  const gospel = votd.readings?.items.find((r) => r.slot === 'gospel');

  return (
    /* The surface is the card's own, so a dismissed passage takes its panel with it. */
    <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-feed-today__passage">
      {/* The reminder link scrolls to this anchor, whichever shape the passage is in. */}
      {/* No kicker (Nov 2026, Derek): the reference already says what this is. It stays as the
          region's name, for anyone who cannot see the card to know what it is. */}
      <div
        className="proto-daily-passage"
        id="todays-passage"
        role="region"
        aria-label={gospel ? DAILY_GOSPEL_SECTION_TITLE : DAILY_PASSAGE_SECTION_TITLE}
      >
        <button
          type="button"
          className="proto-side-panel__action-btn proto-daily-passage__dismiss"
          aria-label="Dismiss today's passage"
          title="Not today"
          onClick={dismiss}
        >
          <Icon name="xmark" size={12} aria-hidden />
        </button>
        <div className="proto-daily-passage__words">
          <p
            ref={textRef}
            className={`proto-review-dock__verse proto-review-dock__verse--scripture${
              expanded ? '' : ' proto-daily-passage__text--folded'
            }`}
            data-overflows={!expanded && overflows ? 'true' : undefined}
            {...(!expanded && overflows
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-expanded': false,
                  'aria-label': 'Show the whole passage',
                  onClick: () => setExpanded(true),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setExpanded(true);
                    }
                  },
                }
              : {})}
            dangerouslySetInnerHTML={markup}
          />
        </div>
        {/* The signature line: the reference and its translation, then the two buttons. Both
            buttons secondary — the accent fill made the reader button the loudest thing on
            Home, louder than the passage it serves. The words carry the card. */}
        <div className="proto-daily-passage__foot">
          <div className="proto-daily-passage__ref">
            <h3 className="proto-daily-passage__title">{gospel ? gospel.citation : votd.reference}</h3>
            <span
              className="scripture-pill-chrome__trans-chip proto-daily-passage__trans-chip"
              title={translation?.name ?? votd.translation}
              aria-label={`Translation: ${translation?.name ?? votd.translation}`}
            >
              {(translation?.abbreviation ?? votd.translation).toUpperCase()}
            </span>
          </div>
          <div className="proto-daily-passage__actions">
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
              aria-label="Open in Bible"
              title="Open in Bible"
              onClick={openInReader}
            >
              <Icon name="book-open" size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
              aria-label={noteActionLabel}
              title={noteActionLabel}
              onClick={takeNote}
            >
              <Icon name={todaysNote ? 'note-sticky' : 'pen-to-square'} size={15} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
