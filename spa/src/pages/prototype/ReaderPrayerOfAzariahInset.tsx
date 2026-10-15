import { Fragment, useId, useState } from 'react';
import Icon from '@/components/react/Icon';
import { usePrototypeBibleChapter } from '../../hooks/queries/usePrototypeBibleChapter';
import { PRAYER_OF_AZARIAH } from '@/utils/bible-book-chapters';
import { translationHasDeuterocanon } from '@/data/translations';

/** Daniel 3 verse the Greek addition follows in a Catholic Bible. */
export const AZARIAH_AFTER_VERSE = 23;

/** True when this page is Daniel 3 in a translation that prints the Prayer of Azariah inside it. */
export function showsPrayerOfAzariahInset(book: string, chapter: number, translation: string): boolean {
  return book === 'Daniel' && chapter === 3 && translationHasDeuterocanon(translation);
}

/**
 * Open or closed, kept for the session rather than per mount: paging away and back, or
 * switching NABRE to DRB, should not fold the passage someone chose to read.
 */
let expandedThisSession = false;

/**
 * Daniel 3:24–90 where a Catholic Bible prints it, between verses 23 and 24, as one quiet line.
 *
 * Harvous keeps one numbering, and English Daniel 3:24–30 is already the fourth man in the
 * fire, so the Greek passage is stored as its own book, "Prayer of Azariah" 1:1–67 (verse n is
 * Daniel 3:n+23 in print). Sixty-seven verses printed in full took over the chapter, so the
 * passage is folded to a single line and opens in place. Opened, it reads as text: selection,
 * highlights and notes are keyed to this page's verses, so they live on the passage's own page.
 *
 * The text is fetched with the chapter, not on open, so opening never waits.
 */
export default function ReaderPrayerOfAzariahInset({
  book,
  chapter,
  translation,
  onOpen,
}: {
  book: string;
  chapter: number;
  translation: string;
  onOpen?: (book: string, chapter: number) => void;
}) {
  const shows = showsPrayerOfAzariahInset(book, chapter, translation);
  const [expanded, setExpanded] = useState(expandedThisSession);
  const textId = useId();
  // Disabled (no book) everywhere else, so no other chapter pays for this query.
  const { data } = usePrototypeBibleChapter(shows ? PRAYER_OF_AZARIAH : undefined, 1, translation);
  if (!shows || !data?.verses.length) return null;

  const toggle = () => {
    expandedThisSession = !expanded;
    setExpanded(!expanded);
  };

  return (
    <div className="pds-reader-inset">
      <button
        type="button"
        className="pds-reader-inset__toggle"
        aria-expanded={expanded}
        aria-controls={textId}
        onClick={toggle}
      >
        <span className="pds-reader-inset__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={10} />
        </span>
        <span>Prayer of Azariah and Song of the Three</span>
        <span className="pds-reader-inset__range">3:24–90</span>
      </button>
      {expanded ? (
        <p id={textId} className="pds-reader-text pds-reader-inset__text">
          {data.verses.map((verse, i) => (
            <Fragment key={verse.number}>
              {i > 0 ? ' ' : null}
              <sup className="pds-reader-verse-num">{verse.number}</sup>
              {verse.text}
            </Fragment>
          ))}
          {onOpen ? (
            <>
              {' '}
              <button
                type="button"
                className="pds-reader-inset__open"
                onClick={() => onOpen(PRAYER_OF_AZARIAH, 1)}
              >
                Highlight or take notes
              </button>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
