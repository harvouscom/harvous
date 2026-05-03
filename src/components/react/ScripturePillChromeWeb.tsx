'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
// @ts-ignore — JSON resolveJsonModule
import bibleChaptersData from '@/data/bible-chapters.json';
import {
  getChapterVerseRange,
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';
import { TRANSLATION_ORDER, TRANSLATIONS } from '@/data/translations';
import { getCachedProfileData } from '@/utils/profile-cache';
import { safeRenderHtml } from '@/utils/content-renderer';

import '@/styles/scripture-pill-chrome.css';

type BibleChapterRow = { book: string; chapter: number };

function orderedCanonBooks(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of bibleChaptersData as BibleChapterRow[]) {
    if (!seen.has(row.book)) {
      seen.add(row.book);
      out.push(row.book);
    }
  }
  return out;
}

function maxChapterForBook(book: string): number {
  let max = 0;
  for (const row of bibleChaptersData as BibleChapterRow[]) {
    if (row.book === book) max = Math.max(max, row.chapter);
  }
  return max || 1;
}

async function fetchVerseHtml(reference: string, translation: string): Promise<string | null> {
  try {
    const res = await fetch('/api/scripture/fetch-verse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ reference, translation }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.text && typeof data.text === 'string') return data.text;
  } catch {
    /* ignore */
  }
  return null;
}

function buildReferenceString(book: string, chapter: number, verseStart: number, verseEnd: number, useRange: boolean): string {
  if (useRange && verseEnd !== verseStart) {
    return normalizeScriptureReference(`${book} ${chapter}:${verseStart}-${verseEnd}`) ?? `${book} ${chapter}:${verseStart}-${verseEnd}`;
  }
  return normalizeScriptureReference(`${book} ${chapter}:${verseStart}`) ?? `${book} ${chapter}:${verseStart}`;
}

export interface ScripturePillChromeWebProps {
  reference: string;
  translation: string | null;
  /** Close without applying — native “Done”. */
  onDone: () => void;
  /** Persist reference + translation into the pill (caller updates ProseMirror + optional API). */
  onApply: (nextReference: string, nextTranslation: string) => Promise<void> | void;
}

/**
 * Bottom chrome for scripture pill editing — macOS-style pickers + passage preview (Web).
 */
export default function ScripturePillChromeWeb({ reference, translation, onDone, onApply }: ScripturePillChromeWebProps) {
  const books = useMemo(() => orderedCanonBooks(), []);

  const initialParsed = useMemo(() => parseScriptureReference(normalizeScriptureReference(reference.trim()) || reference.trim()), [reference]);

  const [selectedBook, setSelectedBook] = useState(initialParsed?.book ?? 'John');
  const [chapter, setChapter] = useState(initialParsed?.chapter ?? 1);
  const [verseStart, setVerseStart] = useState(() => {
    if (!initialParsed) return 1;
    const v = initialParsed.verse;
    return Array.isArray(v) ? v[0] : v;
  });
  const [verseEnd, setVerseEnd] = useState(() => {
    if (!initialParsed) return 1;
    const v = initialParsed.verse;
    return Array.isArray(v) ? v[1] : v;
  });
  const [useVerseRange, setUseVerseRange] = useState(() =>
    initialParsed ? Array.isArray(initialParsed.verse) && initialParsed.verse[0] !== initialParsed.verse[1] : false,
  );
  const [trans, setTrans] = useState(translation || getCachedProfileData()?.defaultTranslation || 'NET');

  const [passageHtml, setPassageHtml] = useState<string>('');
  const [loadingPassage, setLoadingPassage] = useState(false);

  useEffect(() => {
    const p = parseScriptureReference(normalizeScriptureReference(reference.trim()) || reference.trim());
    if (p) {
      setSelectedBook(p.book);
      setChapter(p.chapter);
      if (Array.isArray(p.verse)) {
        setVerseStart(p.verse[0]);
        setVerseEnd(p.verse[1]);
        setUseVerseRange(p.verse[0] !== p.verse[1]);
      } else {
        setVerseStart(p.verse);
        setVerseEnd(p.verse);
        setUseVerseRange(false);
      }
    }
    setTrans(translation || getCachedProfileData()?.defaultTranslation || 'NET');
  }, [reference, translation]);

  const displayRefString = useMemo(
    () => buildReferenceString(selectedBook, chapter, verseStart, verseEnd, useVerseRange),
    [selectedBook, chapter, verseStart, verseEnd, useVerseRange],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingPassage(true);
      const html = await fetchVerseHtml(displayRefString, trans);
      if (cancelled) return;
      setPassageHtml(html || '');
      setLoadingPassage(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [displayRefString, trans]);

  const maxChapter = maxChapterForBook(selectedBook);
  const verseBoundsForChapter = getChapterVerseRange(selectedBook, chapter);
  const vStartCanon = verseBoundsForChapter?.start ?? 1;
  const vEndCanon = verseBoundsForChapter?.end ?? 176;

  const clampVerses = useCallback(() => {
    let ch = chapter;
    if (ch < 1) ch = 1;
    if (ch > maxChapter) ch = maxChapter;
    setChapter(ch);
    let vs = verseStart;
    let ve = useVerseRange ? verseEnd : verseStart;
    const vb = getChapterVerseRange(selectedBook, ch);
    if (!vb) return;
    if (vs < vb.start) vs = vb.start;
    if (vs > vb.end) vs = vb.end;
    if (ve < vb.start) ve = vb.start;
    if (ve > vb.end) ve = vb.end;
    if (ve < vs) ve = vs;
    setVerseStart(vs);
    setVerseEnd(ve);
  }, [chapter, maxChapter, selectedBook, useVerseRange, verseEnd, verseStart]);

  useEffect(() => {
    clampVerses();
  }, [clampVerses, selectedBook, chapter]);

  const chapterNums = useMemo(() => Array.from({ length: maxChapter }, (_, i) => i + 1), [maxChapter]);
  const verseNums = useMemo(
    () => Array.from({ length: Math.max(0, vEndCanon - vStartCanon + 1) }, (_, i) => vStartCanon + i),
    [vEndCanon, vStartCanon],
  );
  const endVerseNums = useMemo(() => {
    const from = verseStart;
    return Array.from({ length: Math.max(0, vEndCanon - from + 1) }, (_, i) => from + i);
  }, [vEndCanon, verseStart]);

  const handleApply = async () => {
    const built = buildReferenceString(selectedBook, chapter, verseStart, verseEnd, useVerseRange);
    await onApply(normalizeScriptureReference(built) ?? built, trans);
  };

  return (
    <div className="scripture-pill-chrome" role="region" aria-label="Scripture reference editor">
      <div className="scripture-pill-chrome__row">
        <div className="scripture-pill-chrome__scroll">
          <div className="scripture-pill-chrome__controls">
            <label className="scripture-pill-chrome__field">
              <span className="sr-only">Translation</span>
              <select
                className="scripture-pill-chrome__select"
                value={trans}
                onChange={(e) => setTrans(e.target.value)}
                aria-label="Translation"
              >
                {TRANSLATION_ORDER.map((tid) => (
                  <option key={tid} value={tid}>
                    {TRANSLATIONS[tid]?.abbreviation ?? tid}
                  </option>
                ))}
              </select>
            </label>
            <label className="scripture-pill-chrome__field">
              <span className="sr-only">Book</span>
              <select
                className="scripture-pill-chrome__select scripture-pill-chrome__select--book"
                value={selectedBook}
                onChange={(e) => setSelectedBook(e.target.value)}
                aria-label="Book"
              >
                {books.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label className="scripture-pill-chrome__field scripture-pill-chrome__field--narrow">
              <span className="sr-only">Chapter</span>
              <select
                className="scripture-pill-chrome__select"
                value={chapter}
                onChange={(e) => setChapter(parseInt(e.target.value, 10))}
                aria-label="Chapter"
              >
                {chapterNums.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <span className="scripture-pill-chrome__meta" aria-hidden>
              :
            </span>
            <label className="scripture-pill-chrome__field scripture-pill-chrome__field--narrow">
              <span className="sr-only">Verse start</span>
              <select
                className="scripture-pill-chrome__select"
                value={verseStart}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setVerseStart(v);
                  setVerseEnd((end) => (useVerseRange && end < v ? v : end));
                }}
                aria-label="Start verse"
              >
                {verseNums.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {useVerseRange ? (
              <>
                <span className="scripture-pill-chrome__meta" aria-hidden>
                  –
                </span>
                <label className="scripture-pill-chrome__field scripture-pill-chrome__field--narrow">
                  <span className="sr-only">End verse</span>
                  <select
                    className="scripture-pill-chrome__select"
                    value={verseEnd}
                    onChange={(e) => setVerseEnd(parseInt(e.target.value, 10))}
                    aria-label="End verse"
                  >
                    {endVerseNums.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <button
              type="button"
              className={`scripture-pill-chrome__range-toggle${useVerseRange ? ' scripture-pill-chrome__range-toggle--on' : ''}`}
              onClick={() =>
                setUseVerseRange((prev) => {
                  if (!prev) setVerseEnd(verseStart);
                  return !prev;
                })
              }
              title={useVerseRange ? 'Single verse' : 'Verse range'}
              aria-pressed={useVerseRange}
              aria-label={useVerseRange ? 'Switch to single verse' : 'Switch to verse range'}
            >
              ↔
            </button>
          </div>
        </div>
        <div className="scripture-pill-chrome__actions">
          <button type="button" className="btn btn--sm btn--primary scripture-pill-chrome__apply" onClick={() => void handleApply()}>
            Apply
          </button>
          <button type="button" className="btn btn--sm btn--ghost scripture-pill-chrome__done" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
      <div className="scripture-pill-chrome__passage" aria-busy={loadingPassage}>
        <div className="scripture-pill-chrome__passage-head">
          <span className="scripture-pill-chrome__ref">{displayRefString}</span>
          <span className="scripture-pill-chrome__trans">{TRANSLATIONS[trans]?.abbreviation ?? trans}</span>
        </div>
        {loadingPassage ? (
          <p className="scripture-pill-chrome__passage-status">Loading passage…</p>
        ) : passageHtml ? (
          <div
            className="scripture-pill-chrome__passage-html"
            dangerouslySetInnerHTML={{ __html: safeRenderHtml(passageHtml) }}
          />
        ) : (
          <p className="scripture-pill-chrome__passage-status">Could not load this passage.</p>
        )}
      </div>
    </div>
  );
}
