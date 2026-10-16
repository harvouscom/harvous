/**
 * Sixty-six spines, Genesis to Revelation — the card's whole picture.
 *
 * Each spine fills from the bottom by the share of its chapters you have been in, and takes
 * the tone of the deepest study anywhere in it. Every book gets the same width: a spine sized
 * by chapter count would make Psalms a wall and Jude a hairline, and the shelf is about which
 * books, not how long they are.
 */
import type { CSSProperties } from 'react';
import { orderedCanonBooks } from '@/utils/bible-book-chapters';
import {
  chaptersBeenIn,
  deepestLevel,
  levelsForBook,
  type BibleCoverage,
} from '@/utils/bible-coverage';

export default function ProtoCanonShelf({ coverage }: { coverage: BibleCoverage }) {
  return (
    <div className="proto-canon-shelf" aria-hidden="true">
      {orderedCanonBooks().map((book) => {
        const levels = levelsForBook(coverage, book);
        const been = chaptersBeenIn(levels);
        // A book you have opened once still shows: a floor, so one chapter of Psalms is
        // something rather than a pixel.
        const fill = been === 0 ? 0 : Math.max(0.14, been / Math.max(1, levels.length));
        return (
          <span key={book} className="proto-canon-shelf__spine" title={book}>
            {been > 0 ? (
              <span
                className="proto-canon-shelf__fill"
                data-level={deepestLevel(levels)}
                style={{ '--proto-spine-fill': fill } as CSSProperties}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
