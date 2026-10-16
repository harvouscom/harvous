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
 * another device — folds it down to the row further back in Up next for the rest of the day.
 * "Not today" hides both, as it always has.
 *
 * A bare card, not a section: it is the first card of the Up next deck, so the deck's eyebrow
 * is over it and its own caption says what it is — "Today's passage · Psalm 18:1-2 · NET".
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
   * verse takes, with Show more, so the card keeps its place on Home rather than becoming it.
   * Measured, not guessed from length: only text that actually overflows gets the control.
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

  const translationLabel = TRANSLATIONS[votd.translation]?.abbreviation ?? votd.translation;
  /* A Catholic's day: the Mass Gospel is the passage. The same card in every other way — the
     other readings are a tap away in the reader, not chips crowding the words. */
  const gospel = votd.readings?.items.find((r) => r.slot === 'gospel');

  return (
    /* The reminder link scrolls to this anchor, whichever shape the passage is in. */
    <div className="proto-daily-passage" id="todays-passage" data-deck-id="todays-passage">
      <div className="proto-daily-passage__head">
        <p className="proto-caption proto-daily-passage__eyebrow">
          {gospel ? DAILY_GOSPEL_SECTION_TITLE : DAILY_PASSAGE_SECTION_TITLE} ·{' '}
          <span className="proto-daily-passage__ref">
            {gospel ? gospel.citation : votd.reference} · {translationLabel}
          </span>
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
        ref={textRef}
        className={`proto-review-dock__verse proto-review-dock__verse--scripture${
          expanded ? '' : ' proto-daily-passage__text--folded'
        }`}
        dangerouslySetInnerHTML={markup}
      />
      {overflows || expanded ? (
        <button
          type="button"
          className="proto-daily-passage__more"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
      {/* Both secondary: the accent fill made the reader button the loudest thing on
          Activity, louder than the passage it serves. The words carry the card. */}
      <div className="proto-review-dock__actions">
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
          onClick={openInReader}
        >
          Open in Bible
        </button>
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary proto-settings-btn--compact"
          onClick={takeNote}
        >
          {todaysNote ? 'Open your note' : 'Create note'}
        </button>
      </div>
    </div>
  );
}
