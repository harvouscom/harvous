/**
 * Today's passage, with its words, at the top of Activity.
 *
 * The row it replaces sat first in Suggested — the last section, below the fold on a phone —
 * and showed only a reference, so the passage was something you had to go and fetch before
 * you could decide whether it spoke to you. This puts the words where the day starts.
 *
 * A signed epigraph (Nov 2026). A small head names the card and holds its ×; the words come
 * first, large, in the reading face; a dash, the reference and the translation sign them; and
 * two labeled buttons sit on their own row under a hairline. It replaced the plain epigraph (a
 * hung quote mark, two bare icon buttons on the reference line), which Derek found unfinished,
 * and he picked it over a Home-row header because it keeps the card unlike the rows around it.
 * Earlier rounds tried a margin column, a running head, the day's sky behind the reference, and
 * four paper and glass headers; all read as decoration rather than as a different card.
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
  const noteActionLabel = todaysNote ? 'Open your note' : 'Write a note';
  /* A Catholic's day: the Mass Gospel is the passage. The same card in every other way — the
     other readings are a tap away in the reader, not chips crowding the words. */
  const gospel = votd.readings?.items.find((r) => r.slot === 'gospel');

  const title = gospel ? DAILY_GOSPEL_SECTION_TITLE : DAILY_PASSAGE_SECTION_TITLE;
  const reference = (gospel ? gospel.citation : votd.reference).replace(/(\d)-(\d)/g, '$1\u2013$2');

  return (
    /* The surface is the card's own, so a dismissed passage takes its panel with it. */
    <div className="proto-glass-surface proto-glass-surface--panel proto-list-panel proto-feed-today__passage">
      {/* The reminder link scrolls to this anchor, whichever shape the passage is in. */}
      <div className="proto-daily-passage" id="todays-passage" role="region" aria-label={title}>
        {/* A small head that names the card and holds its ×, so the × sits on a line with
            something rather than floating in the corner (Nov 2026, Derek picked this "signed
            epigraph" over a Home-row header, because it keeps the card unlike the rows). */}
        <div className="proto-daily-passage__head">
          <span className="proto-daily-passage__label" aria-hidden>
            {title}
          </span>
          <button
            type="button"
            className="proto-side-panel__action-btn proto-daily-passage__dismiss"
            aria-label="Dismiss today's passage"
            title="Not today"
            onClick={dismiss}
          >
            <Icon name="xmark" size={12} aria-hidden />
          </button>
        </div>
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
        {/* The signature: a dash, the reference, and the translation, under the words the way a
            quotation is signed. */}
        <div className="proto-daily-passage__sig">
          <span className="proto-daily-passage__dash" aria-hidden>
            {'\u2014'}
          </span>
          <h3 className="proto-daily-passage__title">{reference}</h3>
          <span
            className="proto-daily-passage__trans"
            title={translation?.name ?? votd.translation}
            aria-label={`Translation: ${translation?.name ?? votd.translation}`}
          >
            {(translation?.abbreviation ?? votd.translation).toUpperCase()}
          </span>
        </div>
        {/* Two labeled buttons on their own row, equal halves, under a hairline. Labeled because
            two bare icons did not say what they did; both secondary so the words stay loudest. */}
        <div className="proto-daily-passage__foot">
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-daily-passage__action"
            onClick={openInReader}
          >
            <Icon name="book-open" size={14} aria-hidden />
            Read chapter
          </button>
          <button
            type="button"
            className="proto-settings-btn proto-settings-btn--secondary proto-daily-passage__action"
            onClick={takeNote}
          >
            <Icon name={todaysNote ? 'note-sticky' : 'pen-to-square'} size={14} aria-hidden />
            {noteActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
