/**
 * One book's chapters as a row of cells, each shaded by how far you have been in it.
 *
 * Ink, not blue: the shading is mixed from the text colour, in the register the reader's
 * margin bars use, because it says "your study touches this" rather than "you chose this".
 *
 * Always one line. Cells shrink to fit rather than wrap, so Psalms is a finer strip than Ruth
 * instead of a two-line block that breaks the rhythm of the list.
 */
import type { CoverageLevel } from '@/utils/bible-coverage';
import { chapterCellLabel } from './bible-map-copy';

type ProtoChapterStripProps = {
  book: string;
  levels: readonly CoverageLevel[];
  /** Makes each cell a button. Without it the strip is a picture with one label. */
  onSelectChapter?: (chapter: number) => void;
  className?: string;
};

export default function ProtoChapterStrip({ book, levels, onSelectChapter, className }: ProtoChapterStripProps) {
  const cls = ['proto-chapter-strip', className].filter(Boolean).join(' ');

  if (!onSelectChapter) {
    return (
      <div
        className={cls}
        role="img"
        aria-label={`${book}, ${levels.filter((l) => l > 0).length} of ${levels.length} chapters`}
      >
        {levels.map((level, i) => (
          <span key={i} className="proto-chapter-strip__cell" data-level={level} />
        ))}
      </div>
    );
  }

  return (
    <div className={cls}>
      {levels.map((level, i) => {
        const chapter = i + 1;
        return (
          <button
            key={i}
            type="button"
            className="proto-chapter-strip__cell"
            data-level={level}
            aria-label={chapterCellLabel(book, chapter, level)}
            title={`${book} ${chapter}`}
            onClick={() => onSelectChapter(chapter)}
          />
        );
      })}
    </div>
  );
}
