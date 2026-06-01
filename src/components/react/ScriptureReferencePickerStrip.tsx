'use client';

import React, { useMemo } from 'react';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import HarvousMenuPill from '@/components/react/HarvousMenuPill';
import Icon from '@/components/react/Icon';

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

  const verseOptions = useMemo(
    () => verseNums.map((v) => ({ value: String(v), label: String(v) })),
    [verseNums],
  );

  const endVerseOptions = useMemo(
    () => endVerseNums.map((v) => ({ value: String(v), label: String(v) })),
    [endVerseNums],
  );

  return (
    <div className="scripture-pill-chrome__reference-scroll">
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
              <HarvousMenuPill
                ariaLabel="End verse"
                variant="compact"
                monospaceDigits
                value={String(verseEnd)}
                options={endVerseOptions}
                onChange={(v) => onVerseEndChange(parseInt(v, 10))}
              />
            </>
          ) : null}
        </div>
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
  );
}
