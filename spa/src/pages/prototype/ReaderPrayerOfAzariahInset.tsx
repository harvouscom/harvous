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
 * Daniel 3:24–90 where a Catholic Bible prints it, between verses 23 and 24: one quiet line
 * that opens the passage as a sheet over the chapter.
 *
 * Harvous keeps one numbering, and English Daniel 3:24–30 is already the fourth man in the
 * fire, so the Greek passage is filed as its own chapter, "Prayer of Azariah 1" (verse n is
 * Daniel 3:n+23 in print). Printed in full here it took over the chapter, and opened in place
 * its verses could not be selected, highlighted or noted. As a sheet it is the real reader for
 * that chapter, laid over the page it belongs to, and the edge is the way back to verse 23.
 *
 * The text is fetched with Daniel 3, not on the tap, so the sheet opens with its words already
 * there — the same query key the sheet's reader asks for.
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
  /** Absent on the paper-stack base, where the line is scenery. */
  onOpen?: (book: string, chapter: number) => void;
}) {
  const shows = showsPrayerOfAzariahInset(book, chapter, translation);
  // Disabled (no book) everywhere else, so no other chapter pays for this query.
  const { data } = usePrototypeBibleChapter(shows ? PRAYER_OF_AZARIAH : undefined, 1, translation);
  if (!shows || !data?.verses.length) return null;

  const line = (
    <>
      <span>Prayer of Azariah and Song of the Three</span>
      <span className="pds-reader-inset__range">3:24–90</span>
      <span className="pds-reader-inset__chevron" aria-hidden="true">
        <Icon name="chevron-down" size={10} />
      </span>
    </>
  );

  return (
    <div className="pds-reader-inset">
      {onOpen ? (
        <button type="button" className="pds-reader-inset__toggle" onClick={() => onOpen(PRAYER_OF_AZARIAH, 1)}>
          {line}
        </button>
      ) : (
        <span className="pds-reader-inset__toggle">{line}</span>
      )}
    </div>
  );
}
