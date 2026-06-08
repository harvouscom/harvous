'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
// @ts-ignore — JSON resolveJsonModule
import bibleChaptersData from '@/data/bible-chapters.json';
import {
  getChapterVerseRange,
  normalizeScriptureReference,
  parseScriptureReference,
} from '@/utils/scripture-detector';
import { TRANSLATIONS } from '@/data/translations';
import { getCachedProfileData } from '@/utils/profile-cache';
import { safeRenderHtml } from '@/utils/content-renderer';
import { fetchVerseHtml } from '@/utils/fetch-verse-html';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import { isStudyHighlightAccentKey, scriptureDockChromeAccent } from '@/utils/study-highlight-accents';

import Icon from '@/components/react/Icon';
import DockAccentSwatchButton from '@/components/react/DockAccentSwatchButton';
import ScriptureReferencePickerStrip from '@/components/react/ScriptureReferencePickerStrip';
import StudyDockCardShell from '@/components/react/StudyDockCardShell';
import '@/styles/harvous-menu-pill.css';
import '@/styles/study-dock-card.css';
import '@/styles/scripture-pill-chrome.css';
import '@/styles/highlight-dock-web.css';

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

function buildReferenceString(book: string, chapter: number, verseStart: number, verseEnd: number, useRange: boolean): string {
  if (useRange && verseEnd !== verseStart) {
    return normalizeScriptureReference(`${book} ${chapter}:${verseStart}-${verseEnd}`) ?? `${book} ${chapter}:${verseStart}-${verseEnd}`;
  }
  return normalizeScriptureReference(`${book} ${chapter}:${verseStart}`) ?? `${book} ${chapter}:${verseStart}`;
}

const DOCK_CHROME_OVERHEAD_FALLBACK_PX = 120;

function measureDockChromeOverheadPx(cardEl: HTMLElement | null): number {
  if (!cardEl) return DOCK_CHROME_OVERHEAD_FALLBACK_PX;
  const header = cardEl.querySelector('.study-dock-card__header');
  const refBar = cardEl.querySelector('.scripture-pill-chrome__reference-bar');
  const headerH = header?.getBoundingClientRect().height ?? 0;
  const refBarH = refBar?.getBoundingClientRect().height ?? 0;
  const overhead = Math.round(headerH + refBarH + 10);
  return overhead > 0 ? overhead : DOCK_CHROME_OVERHEAD_FALLBACK_PX;
}

/** Max passage scroll height — prototype shell uses chrome-row space; otherwise native macOS formula. */
function passageScrollCapPx(chromeOverhead = DOCK_CHROME_OVERHEAD_FALLBACK_PX): number {
  if (typeof window === 'undefined') return 360;
  const chromeRow = document.querySelector('.proto-shell__editor-chrome-row');
  if (chromeRow) {
    const available = Math.round(chromeRow.getBoundingClientRect().top - 16);
    if (available > 0) {
      return Math.max(120, available - chromeOverhead);
    }
  }
  const v = Math.max(window.innerHeight, 1);
  return Math.min(360, Math.max(200, v * 0.45));
}

export interface ScripturePillChromeWebProps {
  reference: string;
  translation: string | null;
  /** Parent note id — loads passage-linked study rows for this reference + translation. */
  sourceNoteId?: string | null;
  /** Persisted per-pill accent (`data-pill-accent`). */
  initialPillAccent?: string | null;
  /** User picked a new accent swatch — caller updates the `scripturePill` mark. */
  onPillAccentChange?: (accent: StudyHighlightAccentKey) => void;
  /** Close without applying — native dismiss. */
  onDone: () => void;
  /** Persist reference + translation into the pill (caller updates ProseMirror + optional API). */
  onApply: (nextReference: string, nextTranslation: string) => Promise<void> | void;
  /** When set with `onExpandedChange`, controls collapse/expand from the dock carousel. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** When false, skips live apply + passage loads (inactive carousel card). Default true. */
  interactionActive?: boolean;
  /** Card enter animation — off in carousel (item handles enter). */
  animateEnter?: boolean;
  /** Called after the user selects passage text and taps the floating highlight button.
   *  Caller (TiptapEditor) should open a HighlightDockWeb card for the new thread. */
  onPassageHighlightCreated?: (excerpt: string, threadId: string) => void;
}

/**
 * Bottom chrome for scripture pill editing — native-style card dock with header, reference bar, passage.
 */
export default function ScripturePillChromeWeb({
  reference,
  translation,
  sourceNoteId = null,
  initialPillAccent = null,
  onPillAccentChange,
  onDone,
  onApply,
  expanded: expandedControlled,
  onExpandedChange,
  interactionActive = true,
  animateEnter = true,
  onPassageHighlightCreated,
}: ScripturePillChromeWebProps) {
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
  const [isExpandedInternal, setIsExpandedInternal] = useState(true);
  const isControlledExpanded = expandedControlled !== undefined && onExpandedChange !== undefined;
  const isExpanded = isControlledExpanded ? expandedControlled! : isExpandedInternal;
  const setIsExpanded = (next: boolean) => {
    if (isControlledExpanded) onExpandedChange!(next);
    else setIsExpandedInternal(next);
  };

  const [passageHtml, setPassageHtml] = useState<string>('');
  const [loadingPassage, setLoadingPassage] = useState(false);
  const [passageContentHeight, setPassageContentHeight] = useState(0);
  const [passageScrollCap, setPassageScrollCap] = useState(() => passageScrollCapPx());
  const passageContentRef = useRef<HTMLDivElement>(null);
  // Passage text selection → highlight creation
  const passageScrollRef = useRef<HTMLDivElement>(null);
  const [passageSelection, setPassageSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [creatingHighlight, setCreatingHighlight] = useState(false);

  const onApplyRef = useRef(onApply);
  useLayoutEffect(() => { onApplyRef.current = onApply; });

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

  const lastApplied = useRef({ ref: displayRefString, trans });

  useEffect(() => {
    if (!interactionActive) return;
    if (displayRefString === lastApplied.current.ref && trans === lastApplied.current.trans) return;
    lastApplied.current = { ref: displayRefString, trans };
    void onApplyRef.current(normalizeScriptureReference(displayRefString) ?? displayRefString, trans);
  }, [displayRefString, trans, interactionActive]);

  useEffect(() => {
    if (!interactionActive || !isExpanded) {
      setPassageHtml('');
      setLoadingPassage(false);
      return;
    }
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
  }, [displayRefString, trans, interactionActive, isExpanded]);

  useLayoutEffect(() => {
    const updateCap = () => {
      const cardEl = passageScrollRef.current?.closest<HTMLElement>('.study-dock-card__card') ?? null;
      const overhead = measureDockChromeOverheadPx(cardEl);
      setPassageScrollCap(passageScrollCapPx(overhead));
    };
    updateCap();
    window.addEventListener('resize', updateCap);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', updateCap);
    return () => {
      window.removeEventListener('resize', updateCap);
      vv?.removeEventListener('resize', updateCap);
    };
  }, [isExpanded, passageHtml, loadingPassage]);

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

  const [passageStudyThreads, setPassageStudyThreads] = useState<
    { id: string; scripturePassageExcerpt: string | null; highlightAccentRaw: string; entryKind: string }[]
  >([]);

  useEffect(() => {
    if (!interactionActive || !isExpanded || !sourceNoteId) {
      setPassageStudyThreads([]);
      return;
    }
    let cancelled = false;
    const norm = normalizeScriptureReference(displayRefString.trim()) ?? displayRefString;
    void (async () => {
      try {
        const res = await fetch(
          `/api/notes/${sourceNoteId}/study-threads/by-scripture?reference=${encodeURIComponent(norm)}&translation=${encodeURIComponent(trans)}`,
          { credentials: 'include' },
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const rows = Array.isArray(data.studyThreads) ? data.studyThreads : [];
        if (cancelled) return;
        setPassageStudyThreads(rows.filter((r: { entryKind?: string }) => r.entryKind === 'scriptureLink'));
      } catch {
        if (!cancelled) setPassageStudyThreads([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceNoteId, displayRefString, trans, interactionActive, isExpanded]);

  useEffect(() => {
    const el = passageContentRef.current;
    if (!el || !isExpanded) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      setPassageContentHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExpanded, passageHtml, loadingPassage, passageStudyThreads]);

  // ── Passage text selection detection ──────────────────────────────────────
  useEffect(() => {
    const scrollEl = passageScrollRef.current;
    if (!scrollEl || !isExpanded) return;

    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!scrollEl.contains(range.commonAncestorContainer)) return;
      const text = sel.toString().trim();
      if (!text) return;
      const rect = range.getBoundingClientRect();
      setPassageSelection({ text, rect });
    };

    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPassageSelection(null);
    };

    const handleScroll = () => setPassageSelection(null);

    scrollEl.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    scrollEl.addEventListener('scroll', handleScroll);
    return () => {
      scrollEl.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      scrollEl.removeEventListener('scroll', handleScroll);
    };
  }, [isExpanded]);

  const handleCreatePassageHighlight = useCallback(async () => {
    if (!passageSelection || !sourceNoteId || creatingHighlight) return;
    setCreatingHighlight(true);
    try {
      const norm = normalizeScriptureReference(displayRefString) ?? displayRefString;
      const res = await fetch(`/api/notes/${sourceNoteId}/study-threads`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryKind: 'scriptureLink',
          scripturePassageExcerpt: passageSelection.text,
          scriptureReference: norm,
          scripturePassageTranslation: trans,
          highlightAccentRaw: 'warmAmber',
          sourceSnippet: passageSelection.text,
          focusTitle: passageSelection.text.slice(0, 80),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const threadId: string | null = data.studyThread?.id ?? null;
        if (threadId) {
          setPassageStudyThreads((prev) => [
            ...prev,
            {
              id: threadId,
              scripturePassageExcerpt: passageSelection.text,
              highlightAccentRaw: 'warmAmber',
              entryKind: 'scriptureLink',
            },
          ]);
          onPassageHighlightCreated?.(passageSelection.text, threadId);
        }
      }
    } catch {
      /* ignore — highlight list will still reflect server state on next load */
    }
    setPassageSelection(null);
    window.getSelection()?.removeAllRanges();
    setCreatingHighlight(false);
  }, [passageSelection, sourceNoteId, creatingHighlight, displayRefString, trans, onPassageHighlightCreated]);
  // ──────────────────────────────────────────────────────────────────────────

  const removePassageStudy = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/study-threads/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setPassageStudyThreads((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const selectedSwatchKey: StudyHighlightAccentKey =
    initialPillAccent && isStudyHighlightAccentKey(initialPillAccent) ? initialPillAccent : 'neutral';

  const toggleExpanded = useCallback(() => {
    if (isControlledExpanded) {
      onExpandedChange!(!isExpanded);
    } else {
      setIsExpandedInternal((prev) => !prev);
    }
  }, [isControlledExpanded, isExpanded, onExpandedChange]);

  const handleToggleVerseRange = useCallback(() => {
    setUseVerseRange((prev) => {
      if (!prev) setVerseEnd(verseStart);
      return !prev;
    });
  }, [verseStart]);

  const passageScrollHeight =
    passageContentHeight > 0 ? Math.min(passageContentHeight, passageScrollCap) : passageScrollCap;

  const translationInfo = TRANSLATIONS[trans];
  const transLabel = (translationInfo?.abbreviation ?? trans).toUpperCase();

  return (
    <>
    <StudyDockCardShell
      rootClassName="scripture-pill-chrome"
      ariaLabel="Scripture reference editor"
      accentColor={scriptureDockChromeAccent(initialPillAccent)}
      expanded={isExpanded}
      onToggleExpanded={toggleExpanded}
      onDismiss={onDone}
      animateEnter={animateEnter}
      headerIcon={<Icon name="book-open" size={13} />}
      headerTitle={
        <span className="scripture-pill-chrome__header-label">
          <span
            className="scripture-pill-chrome__title-text study-dock-card__header-primary-text"
            aria-label="Scripture reference"
          >
            {displayRefString}
          </span>
          <span className="scripture-pill-chrome__trans-chip" aria-label={`Translation ${transLabel}`}>
            {transLabel}
          </span>
        </span>
      }
      headerActions={
        onPillAccentChange ? (
          <DockAccentSwatchButton selection={selectedSwatchKey} onSelectionChange={onPillAccentChange} />
        ) : null
      }
    >
      <div className="scripture-pill-chrome__reference-bar">
        <ScriptureReferencePickerStrip
          books={books}
          selectedBook={selectedBook}
          onBookChange={setSelectedBook}
          chapter={chapter}
          chapterNums={chapterNums}
          onChapterChange={setChapter}
          verseStart={verseStart}
          verseNums={verseNums}
          onVerseStartChange={(v) => {
            setVerseStart(v);
            setVerseEnd((end) => (useVerseRange && end < v ? v : end));
          }}
          verseEnd={verseEnd}
          endVerseNums={endVerseNums}
          onVerseEndChange={setVerseEnd}
          useVerseRange={useVerseRange}
          onToggleVerseRange={handleToggleVerseRange}
          translation={trans}
          onTranslationChange={setTrans}
        />
      </div>
      <div
        ref={passageScrollRef}
        className="scripture-pill-chrome__passage"
        style={{ maxHeight: passageScrollHeight }}
        aria-busy={loadingPassage}
        // tabIndex=-1 makes this a valid focus target on click so the browser
        // doesn't bounce focus back to the editor, allowing text selection.
        tabIndex={-1}
      >
        <div ref={passageContentRef} className="scripture-pill-chrome__passage-inner">
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
          {sourceNoteId && passageStudyThreads.length > 0 ? (
            <div className="scripture-pill-chrome__passage-highlights">
              <p className="scripture-pill-chrome__section-label">Passage highlights</p>
              <ul className="scripture-pill-chrome__study-list">
                {passageStudyThreads.map((row) => (
                  <li key={row.id} className="scripture-pill-chrome__study-item">
                    <p className="scripture-pill-chrome__study-excerpt">
                      {row.scripturePassageExcerpt?.trim() || '(passage highlight)'}
                    </p>
                    <button
                      type="button"
                      className="study-dock-card__header-btn study-dock-card__header-btn--plain"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void removePassageStudy(row.id)}
                      aria-label="Remove passage highlight"
                    >
                      <Icon name="trash-can" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {translationInfo ? (
            <div className="scripture-pill-chrome__attribution" role="contentinfo" aria-label="Translation attribution">
              <Icon
                name="circle-info"
                size={9}
                className="scripture-pill-chrome__attribution-icon"
                aria-label="Translation attribution"
              />
              <p className="scripture-pill-chrome__attribution-copyright">{translationInfo.copyright}</p>
              <a
                href={translationInfo.website}
                target="_blank"
                rel="noopener noreferrer"
                className="scripture-pill-chrome__attribution-link"
              >
                {transLabel}
                <Icon name="arrow-up-right-from-square" size={7} aria-hidden />
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </StudyDockCardShell>
    {/* Floating passage highlight action bar — portal to document.body to escape scroll clip */}
    {passageSelection && sourceNoteId && passageHtml && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="scripture-pill-chrome__passage-action-bar"
            style={{
              top: Math.max(8, passageSelection.rect.top - 40),
              left: Math.max(
                8,
                Math.min(
                  passageSelection.rect.left + passageSelection.rect.width / 2 - 18,
                  (typeof window !== 'undefined' ? window.innerWidth : 800) - 44,
                ),
              ),
            }}
            // Prevent mousedown from clearing the selection before click fires
            onMouseDown={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="study-dock-card__header-btn"
              onClick={() => void handleCreatePassageHighlight()}
              disabled={creatingHighlight}
              aria-label="Highlight selected passage text"
              title="Highlight"
            >
              <Icon name="highlighter" size={12} />
            </button>
          </div>,
          document.body,
        )
      : null}
    </>
  );
}
