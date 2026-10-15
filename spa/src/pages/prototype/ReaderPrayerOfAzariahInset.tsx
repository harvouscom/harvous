import { Fragment } from 'react';
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
 * Daniel 3:24–90 where a Catholic Bible prints it, between verses 23 and 24.
 *
 * Harvous keeps one numbering, and English Daniel 3:24–30 is already the fourth man in the
 * fire, so the Greek passage is stored as its own book, "Prayer of Azariah" 1:1–67 (verse n is
 * Daniel 3:n+23 in print). Here it reads in place, as text: selection, highlights and notes are
 * keyed to this page's verses, so they live on the passage's own page, one press away.
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
  // Disabled (no book) everywhere else, so no other chapter pays for this query.
  const { data } = usePrototypeBibleChapter(shows ? PRAYER_OF_AZARIAH : undefined, 1, translation);
  if (!shows || !data?.verses.length) return null;

  return (
    <aside className="pds-reader-inset" aria-label="Prayer of Azariah and Song of the Three">
      <header className="pds-reader-inset__header">
        <h3 className="pds-reader-inset__title">Prayer of Azariah and Song of the Three</h3>
        <p className="pds-reader-inset__caption">Daniel 3:24–90 in Catholic Bibles</p>
      </header>
      <p className="pds-reader-text pds-reader-inset__text">
        {data.verses.map((verse, i) => (
          <Fragment key={verse.number}>
            {i > 0 ? ' ' : null}
            <sup className="pds-reader-verse-num">{verse.number}</sup>
            {/* The printed Daniel 3 number, as the reader shows NABRE/DRB numbers elsewhere. */}
            <sup className="pds-reader-verse-num pds-reader-verse-num--printed">
              <span aria-hidden>·</span>
              <span className="sr-only">, Daniel 3:</span>
              {verse.number + AZARIAH_AFTER_VERSE}
            </sup>
            {verse.text}
          </Fragment>
        ))}
      </p>
      {onOpen ? (
        <button
          type="button"
          className="proto-settings-btn proto-settings-btn--secondary pds-reader-inset__open"
          onClick={() => onOpen(PRAYER_OF_AZARIAH, 1)}
        >
          Highlight or take notes
        </button>
      ) : null}
    </aside>
  );
}
