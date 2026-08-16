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
  /**
   * Passage tools — cross-references, related notes, accent — pinned to the row's trailing
   * edge, outside the scroller so they never scroll away. They belong beside the reference
   * rather than in the header: they change what you see *about this passage*, while the
   * header's controls act on the card itself.
   */
  tools?: React.ReactNode;
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
  tools,
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
  /*
   * Keep the end of the reference in view.
   *
   * The row is a horizontal scroller — on a phone it holds about half of what it contains —
   * and the end is where the answer is: the last verse, and now the toggle that turns a
   * single verse into a range. This used to run only when a range was already on, which left
   * the single-verse case showing "KJV · Exodus · 5" with the ":1" and the toggle scrolled
   * out of sight, so the one control for making a range was invisible until you had one.
   *
   * What scrolls out of the leading edge is the translation, and it is the one thing here
   * that is also stated in the header chip — so nothing is actually hidden, and it is a
   * swipe away.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return;
    const id = requestAnimationFrame(() => {
      const reduceMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left: el.scrollWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [useVerseRange, chapter, verseStart, verseEnd, endChapter, selectedBook]);

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
          {/*
            Inside the cluster, at the end of the range it toggles.
            
            It used to be pinned to the far right of the row, outside the scroller, on the
            reasoning that a control must stay reachable however wide the reference gets.
            True, but it bought reachability with meaning: a lone arrow floating an inch away
            from `1 : 1 – 32` does not say what it acts on, and people read it as something to
            do with the card. It is the range's own control, so it lives on the end of the
            range — and it scrolls with it, exactly as the End verse pill beside it already
            did.
          */}
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
        </div>
      </div>
      {/*
        What to do with this passage, pinned where the toggle used to be.
        
        The row now reads left to right as one sentence — which passage, in which translation,
        over which verses, and then what to look at alongside it. The card's own actions
        (open it bigger, fold it away, close it) stay in the header, which is the other half
        of the split: this row is the passage, the header is the card.
      */}
      {tools ? <div className="scripture-pill-chrome__reference-tools">{tools}</div> : null}
    </div>
  );
}
