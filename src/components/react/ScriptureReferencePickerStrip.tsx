'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import HarvousMenuPill from '@/components/react/HarvousMenuPill';
import Icon from '@/components/react/Icon';

/** Sentinel end-verse option that pushes the range into the next chapter. */
const NEXT_CHAPTER_OPTION = '__next-chapter__';

export interface ScriptureReferencePickerStripProps {
  books: string[];
  selectedBook: string;
  onBookChange: (book: string) => void;
  chapter: number;
  chapterNums: number[];
  onChapterChange: (chapter: number) => void;
  verseStart: number;
  verseNums: number[];
  onVerseStartChange: (verse: number) => void;
  endChapter: number;
  endChapterNums: number[];
  onEndChapterChange: (chapter: number) => void;
  verseEnd: number;
  endVerseNums: number[];
  onVerseEndChange: (verse: number) => void;
  useVerseRange: boolean;
  onToggleVerseRange: () => void;
  translation: string;
  onTranslationChange: (translation: string) => void;
}

export default function ScriptureReferencePickerStrip({
  books,
  selectedBook,
  onBookChange,
  chapter,
  chapterNums,
  onChapterChange,
  verseStart,
  verseNums,
  onVerseStartChange,
  endChapter,
  endChapterNums,
  onEndChapterChange,
  verseEnd,
  endVerseNums,
  onVerseEndChange,
  useVerseRange,
  onToggleVerseRange,
  translation,
  onTranslationChange,
}: ScriptureReferencePickerStripProps) {
  const translationOptions = useMemo(
    () =>
      TRANSLATION_ORDER.map((tid) => ({
        value: tid,
        label: TRANSLATIONS[tid]?.abbreviation ?? tid,
      })),
    [],
  );

  const bookOptions = useMemo(() => books.map((b) => ({ value: b, label: b })), [books]);

  const chapterOptions = useMemo(
    () => chapterNums.map((c) => ({ value: String(c), label: String(c) })),
    [chapterNums],
  );

  const endChapterOptions = useMemo(
    () => endChapterNums.map((c) => ({ value: String(c), label: String(c) })),
    [endChapterNums],
  );

  const verseOptions = useMemo(
    () => verseNums.map((v) => ({ value: String(v), label: String(v) })),
    [verseNums],
  );

  // The end-chapter picker only appears once a range actually crosses chapters — on a 390pt
  // iPhone it plus its colon is ~50px, which is exactly what pushed the end VERSE off the right
  // edge of the scroller (where nothing indicated it existed).
  const showEndChapter = useVerseRange && endChapter !== chapter;

  const maxChapter = endChapterNums.length > 0 ? endChapterNums[endChapterNums.length - 1] : chapter;
  const canCrossToNextChapter = useVerseRange && !showEndChapter && endChapter < maxChapter;

  const endVerseOptions = useMemo(() => {
    const opts = endVerseNums.map((v) => ({ value: String(v), label: String(v) }));
    // With the end-chapter pill hidden, this is the way to reach a cross-chapter range: it lives
    // inside the control the user already opened and costs no horizontal space.
    if (canCrossToNextChapter) {
      opts.push({ value: NEXT_CHAPTER_OPTION, label: `Into chapter ${endChapter + 1} →` });
    }
    return opts;
  }, [endVerseNums, canCrossToNextChapter, endChapter]);

  // With a long book name ("1 Corinthians") the strip can still be wider than a 390pt phone even
  // without the end-chapter pill. Whenever the range controls appear or change, scroll them into
  // view — the reported bug was that the end verse was simply never visible.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!useVerseRange) return;
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [useVerseRange, verseEnd, endChapter, selectedBook]);

  const handleEndVerseChange = (value: string) => {
    if (value === NEXT_CHAPTER_OPTION) {
      // The parent's clampVerses re-bounds verseEnd against the new end chapter.
      onEndChapterChange(endChapter + 1);
      return;
    }
    onVerseEndChange(parseInt(value, 10));
  };

  return (
    <div className="scripture-pill-chrome__reference-row">
      <div ref={scrollRef} className="scripture-pill-chrome__reference-scroll">
        <div className="scripture-pill-chrome__reference-controls">
        <HarvousMenuPill
          ariaLabel="Translation"
          value={translation}
          options={translationOptions}
          onChange={onTranslationChange}
        />
        <HarvousMenuPill
          ariaLabel="Book"
          variant="book"
          value={selectedBook}
          options={bookOptions}
          onChange={onBookChange}
        />
        <div className="scripture-ref-cluster">
          <HarvousMenuPill
            ariaLabel="Chapter"
            variant="compact"
            monospaceDigits
            value={String(chapter)}
            options={chapterOptions}
            onChange={(v) => onChapterChange(parseInt(v, 10))}
          />
          <span className="scripture-pill-chrome__meta scripture-pill-chrome__meta--colon" aria-hidden>
            :
          </span>
          <HarvousMenuPill
            ariaLabel="Start verse"
            variant="compact"
            monospaceDigits
            value={String(verseStart)}
            options={verseOptions}
            onChange={(v) => onVerseStartChange(parseInt(v, 10))}
          />
          {useVerseRange ? (
            <>
              <span className="scripture-pill-chrome__meta scripture-pill-chrome__meta--dash" aria-hidden>
                –
              </span>
              {showEndChapter ? (
                <>
                  <HarvousMenuPill
                    ariaLabel="End chapter"
                    variant="compact"
                    monospaceDigits
                    value={String(endChapter)}
                    options={endChapterOptions}
                    onChange={(v) => onEndChapterChange(parseInt(v, 10))}
                  />
                  <span className="scripture-pill-chrome__meta scripture-pill-chrome__meta--colon" aria-hidden>
                    :
                  </span>
                </>
              ) : null}
              <HarvousMenuPill
                ariaLabel="End verse"
                variant="compact"
                monospaceDigits
                value={String(verseEnd)}
                options={endVerseOptions}
                onChange={handleEndVerseChange}
              />
            </>
          ) : null}
          </div>
        </div>
      </div>
      {/* Outside the scroller so it stays reachable no matter how wide the reference gets. */}
      <button
        type="button"
        className={`scripture-pill-chrome__range-toggle${useVerseRange ? ' scripture-pill-chrome__range-toggle--on' : ''}`}
        onClick={onToggleVerseRange}
        title={useVerseRange ? 'Single verse' : 'Verse range'}
        aria-pressed={useVerseRange}
        aria-label={useVerseRange ? 'Switch to single verse' : 'Switch to verse range'}
      >
        <Icon name="arrows-left-right" size={13} />
      </button>
    </div>
  );
}
