'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import PassageContextStrip from '@/components/react/PassageContextStrip';
import {
  createDictionaryReferenceProvider,
  decoratePassageHtmlWithReferenceSuggestions,
  decoratePassageHtmlWithSavedHighlights,
  type PassageHighlightPaint,
  type ReferenceProvider,
} from '@/components/react/TiptapReferenceSuggestion';
import { useEastonsSlugIndex } from '../../../spa/src/hooks/useEastonsSlugIndex';
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

function buildReferenceString(
  book: string,
  chapter: number,
  verseStart: number,
  endChapter: number,
  verseEnd: number,
  useRange: boolean,
): string {
  if (useRange && endChapter !== chapter) {
    // Cross-chapter range: end verse belongs to endChapter (e.g. "Exodus 6:28-7:7").
    const raw = `${book} ${chapter}:${verseStart}-${endChapter}:${verseEnd}`;
    return normalizeScriptureReference(raw) ?? raw;
  }
  if (useRange && verseEnd !== verseStart) {
    return normalizeScriptureReference(`${book} ${chapter}:${verseStart}-${verseEnd}`) ?? `${book} ${chapter}:${verseStart}-${verseEnd}`;
  }
  return normalizeScriptureReference(`${book} ${chapter}:${verseStart}`) ?? `${book} ${chapter}:${verseStart}`;
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
  onPassageHighlightCreated?: (excerpt: string, threadId: string, accent?: StudyHighlightAccentKey) => void;
  /** Gate passage reference suggestions to the prototype/native chrome surface. */
  editorChromeMode?: 'default' | 'prototypeNative';
  /** Tap a passage suggestion or saved mark — caller opens the reference dock (or, for
   *  `entryKind: 'scriptureLink'` marks, the highlight dock — native parity). */
  onOpenPassageReference?: (
    word: string,
    opts?: {
      slug?: string;
      saved?: boolean;
      threadId?: string;
      accent?: StudyHighlightAccentKey;
      entryKind?: string;
    },
  ) => void;
  /** Related note tapped in the passage context strip — caller navigates to it. */
  onNavigateNote?: (noteId: string) => void;
  /** Cross-reference tapped in the context strip — caller opens it as a read-only passage card. */
  onOpenScripturePassage?: (reference: string, translation: string) => void;
  /** Read-only passage card (e.g. a cross-reference) — no pill write-back or highlight chrome. */
  readOnly?: boolean;
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
  editorChromeMode = 'default',
  onOpenPassageReference,
  onNavigateNote,
  onOpenScripturePassage,
  readOnly = false,
}: ScripturePillChromeWebProps) {
  const books = useMemo(() => orderedCanonBooks(), []);
  const { data: eastonsIndex } = useEastonsSlugIndex();
  const referenceProviders = useMemo<ReferenceProvider[]>(
    () => [createDictionaryReferenceProvider(() => eastonsIndex)],
    [eastonsIndex],
  );

  const initialParsed = useMemo(() => parseScriptureReference(normalizeScriptureReference(reference.trim()) || reference.trim()), [reference]);

  const [selectedBook, setSelectedBook] = useState(initialParsed?.book ?? 'John');
  const [chapter, setChapter] = useState(initialParsed?.chapter ?? 1);
  const [endChapter, setEndChapter] = useState(initialParsed?.endChapter ?? initialParsed?.chapter ?? 1);
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
  const [useVerseRange, setUseVerseRange] = useState(() => {
    if (!initialParsed) return false;
    const crossChapter = initialParsed.endChapter != null && initialParsed.endChapter !== initialParsed.chapter;
    const verseRange = Array.isArray(initialParsed.verse) && initialParsed.verse[0] !== initialParsed.verse[1];
    return crossChapter || verseRange;
  });
  const [trans, setTrans] = useState(translation || getCachedProfileData()?.defaultTranslation || 'NET');
  const [showCrossRefs, setShowCrossRefs] = useState(false);
  const [isExpandedInternal, setIsExpandedInternal] = useState(true);
  const isControlledExpanded = expandedControlled !== undefined && onExpandedChange !== undefined;
  const isExpanded = isControlledExpanded ? expandedControlled! : isExpandedInternal;
  const setIsExpanded = (next: boolean) => {
    if (isControlledExpanded) onExpandedChange!(next);
    else setIsExpandedInternal(next);
  };

  const [passageHtml, setPassageHtml] = useState<string>('');
  const [loadingPassage, setLoadingPassage] = useState(false);
  const passageContentRef = useRef<HTMLDivElement>(null);
  // Passage text selection → highlight creation
  const passageScrollRef = useRef<HTMLDivElement>(null);
  const [passageSelection, setPassageSelection] = useState<{ text: string; rect: DOMRect } | null>(null);
  const [creatingHighlight, setCreatingHighlight] = useState(false);

  const onApplyRef = useRef(onApply);
  useEffect(() => {
    onApplyRef.current = onApply;
  });

  useEffect(() => {
    const p = parseScriptureReference(normalizeScriptureReference(reference.trim()) || reference.trim());
    if (p) {
      setSelectedBook(p.book);
      setChapter(p.chapter);
      const endCh = p.endChapter ?? p.chapter;
      setEndChapter(endCh);
      if (Array.isArray(p.verse)) {
        // For a cross-chapter range, p.verse[1] is the end verse within endChapter.
        setVerseStart(p.verse[0]);
        setVerseEnd(p.verse[1]);
        setUseVerseRange(endCh !== p.chapter || p.verse[0] !== p.verse[1]);
      } else {
        setVerseStart(p.verse);
        setVerseEnd(p.verse);
        setUseVerseRange(false);
      }
    }
    setTrans(translation || getCachedProfileData()?.defaultTranslation || 'NET');
  }, [reference, translation]);

  const displayRefString = useMemo(
    () => buildReferenceString(selectedBook, chapter, verseStart, endChapter, verseEnd, useVerseRange),
    [selectedBook, chapter, verseStart, endChapter, verseEnd, useVerseRange],
  );

  // All saved passage study rows (scriptureLink highlights + reference marks) paint INLINE in
  // the passage text — native parity (`ScripturePassageView` underline painting). No list UI.
  const [passagePaints, setPassagePaints] = useState<PassageHighlightPaint[]>([]);

  const displayPassageHtml = useMemo(() => {
    if (editorChromeMode !== 'prototypeNative' || !passageHtml) return passageHtml;
    let html = passageHtml;
    if (passagePaints.length > 0) {
      html = decoratePassageHtmlWithSavedHighlights(html, passagePaints);
    }
    if (eastonsIndex) {
      html = decoratePassageHtmlWithReferenceSuggestions(html, referenceProviders);
    }
    return html;
  }, [editorChromeMode, passageHtml, eastonsIndex, referenceProviders, passagePaints]);

  // Stable `dangerouslySetInnerHTML` object so React only writes innerHTML when the passage
  // content actually changes. A fresh `{ __html }` literal each render makes React 19 re-apply
  // innerHTML on every re-render (e.g. the selectionchange → passageSelection state update),
  // which wipes any in-progress text selection — breaking drag-select inside the dock.
  const passageHtmlMarkup = useMemo(
    () => ({ __html: safeRenderHtml(displayPassageHtml) }),
    [displayPassageHtml],
  );

  // Tap-vs-drag discrimination: marks and suggestion spans are tap targets, but they must NOT
  // block drag-select from starting on them (native parity — the whole passage is selectable).
  // So mousedown only records the pointer origin; the open action runs on click, and only when
  // the pointer didn't drag and no text selection resulted.
  const passagePointerDownRef = useRef<{ x: number; y: number } | null>(null);
  const PASSAGE_TAP_SLOP_PX = 5;

  const handlePassageMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    passagePointerDownRef.current = { x: e.clientX, y: e.clientY };
    // Pull DOM focus out of the (always-editing) TipTap editor into the passage container
    // (tabIndex=-1). While the editor has focus, ProseMirror's selectionchange sync reclaims
    // the DOM selection on every change — which kills a drag-select in the dock the moment it
    // starts. Focus here happens before the browser builds the selection, so the drag survives.
    if (document.activeElement?.closest?.('.ProseMirror')) {
      e.currentTarget.focus({ preventScroll: true });
    }
    // No preventDefault/stopPropagation anywhere in the passage — browser starts drag-select natively.
  }, []);

  const handlePassageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const down = passagePointerDownRef.current;
      passagePointerDownRef.current = null;
      if (!onOpenPassageReference || editorChromeMode !== 'prototypeNative') return;
      // Dragged → this was a selection gesture, not a tap.
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > PASSAGE_TAP_SLOP_PX) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return;

      const target = e.target as HTMLElement;
      const savedMark = target.closest('mark[data-reference]') as HTMLElement | null;
      if (savedMark) {
        e.preventDefault();
        e.stopPropagation();
        const word = savedMark.getAttribute('data-reference') || savedMark.textContent?.trim() || '';
        if (!word) return;
        const threadId = savedMark.getAttribute('data-study-thread-id') || undefined;
        const entryKind = savedMark.getAttribute('data-entry-kind') || undefined;
        const accentRaw = savedMark.getAttribute('data-color');
        const accent: StudyHighlightAccentKey =
          accentRaw && isStudyHighlightAccentKey(accentRaw) ? accentRaw : 'warmAmber';
        onOpenPassageReference(word, { saved: true, threadId, accent, entryKind });
        return;
      }
      const suggestionSpan = target.closest('.reference-suggestion') as HTMLElement | null;
      if (suggestionSpan) {
        e.preventDefault();
        e.stopPropagation();
        const word =
          suggestionSpan.getAttribute('data-reference-word') || suggestionSpan.textContent?.trim() || '';
        if (!word) return;
        const slug = suggestionSpan.getAttribute('data-reference-slug') || undefined;
        onOpenPassageReference(word, { slug });
      }
    },
    [onOpenPassageReference, editorChromeMode],
  );

  const lastApplied = useRef({ ref: displayRefString, trans });

  useEffect(() => {
    if (!interactionActive || readOnly) return;
    if (displayRefString === lastApplied.current.ref && trans === lastApplied.current.trans) return;
    lastApplied.current = { ref: displayRefString, trans };
    void onApplyRef.current(normalizeScriptureReference(displayRefString) ?? displayRefString, trans);
  }, [displayRefString, trans, interactionActive, readOnly]);

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

  const maxChapter = maxChapterForBook(selectedBook);
  const verseBoundsForChapter = getChapterVerseRange(selectedBook, chapter);
  const vStartCanon = verseBoundsForChapter?.start ?? 1;
  const vEndCanon = verseBoundsForChapter?.end ?? 176;
  const verseBoundsForEndChapter = getChapterVerseRange(selectedBook, endChapter);
  const veStartCanon = verseBoundsForEndChapter?.start ?? 1;
  const veEndCanon = verseBoundsForEndChapter?.end ?? 176;

  const clampVerses = useCallback(() => {
    let ch = chapter;
    if (ch < 1) ch = 1;
    if (ch > maxChapter) ch = maxChapter;
    setChapter(ch);
    // End chapter is forward-ordered and never before the start chapter.
    let endCh = useVerseRange ? endChapter : ch;
    if (endCh < ch) endCh = ch;
    if (endCh > maxChapter) endCh = maxChapter;
    setEndChapter(endCh);

    let vs = verseStart;
    let ve = useVerseRange ? verseEnd : verseStart;
    const startVb = getChapterVerseRange(selectedBook, ch);
    if (startVb) {
      if (vs < startVb.start) vs = startVb.start;
      if (vs > startVb.end) vs = startVb.end;
    }
    const endVb = getChapterVerseRange(selectedBook, endCh);
    if (endVb) {
      if (ve < endVb.start) ve = endVb.start;
      if (ve > endVb.end) ve = endVb.end;
    }
    // Same-chapter range must stay forward-ordered; cross-chapter end verse is independent.
    if (endCh === ch && ve < vs) ve = vs;
    setVerseStart(vs);
    setVerseEnd(ve);
  }, [chapter, endChapter, maxChapter, selectedBook, useVerseRange, verseEnd, verseStart]);

  useEffect(() => {
    clampVerses();
  }, [clampVerses, selectedBook, chapter, endChapter]);

  const chapterNums = useMemo(() => Array.from({ length: maxChapter }, (_, i) => i + 1), [maxChapter]);
  const endChapterNums = useMemo(
    () => Array.from({ length: Math.max(0, maxChapter - chapter + 1) }, (_, i) => chapter + i),
    [maxChapter, chapter],
  );
  const verseNums = useMemo(
    () => Array.from({ length: Math.max(0, vEndCanon - vStartCanon + 1) }, (_, i) => vStartCanon + i),
    [vEndCanon, vStartCanon],
  );
  const endVerseNums = useMemo(() => {
    // Same chapter: end verse can't precede the start verse. Cross-chapter: full chapter.
    const from = endChapter === chapter ? verseStart : veStartCanon;
    return Array.from({ length: Math.max(0, veEndCanon - from + 1) }, (_, i) => from + i);
  }, [endChapter, chapter, verseStart, veStartCanon, veEndCanon]);

  const applyByScriptureRows = useCallback(
    (
      rows: {
        id: string;
        entryKind?: string;
        scripturePassageExcerpt?: string | null;
        sourceSnippet?: string | null;
        highlightAccentRaw?: string;
      }[],
    ) => {
      setPassagePaints((prev) => {
        const fromApi = rows
          .filter((r) => r.entryKind === 'scriptureLink' || r.entryKind === 'reference')
          .map((r) => ({
            id: r.id,
            excerpt: (r.scripturePassageExcerpt ?? r.sourceSnippet ?? '').trim(),
            accentRaw: r.highlightAccentRaw ?? 'warmAmber',
            entryKind: r.entryKind as string,
          }))
          .filter((p) => p.excerpt.length > 0);
        const apiIds = new Set(fromApi.map((p) => p.id));
        const optimisticOnly = prev.filter((p) => !apiIds.has(p.id));
        return [...fromApi, ...optimisticOnly];
      });
    },
    [],
  );

  useEffect(() => {
    setPassagePaints([]);
  }, [sourceNoteId, displayRefString, trans]);

  useEffect(() => {
    if (!interactionActive || !isExpanded || !sourceNoteId || readOnly) {
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
        applyByScriptureRows(rows);
      } catch {
        /* keep optimistic paints on fetch failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceNoteId, displayRefString, trans, interactionActive, isExpanded, applyByScriptureRows, readOnly]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{
        sourceNoteId: string;
        reference: string;
        translation: string;
        word: string;
        threadId: string;
        accent: string;
        action: 'save' | 'patch' | 'delete';
      }>).detail;
      if (!detail || String(detail.sourceNoteId) !== String(sourceNoteId ?? '')) return;
      const sessionNorm = normalizeScriptureReference(reference.trim()) ?? reference.trim();
      const savedNorm = normalizeScriptureReference(detail.reference.trim()) ?? detail.reference.trim();
      const sessionTrans = translation || trans;
      if (savedNorm !== sessionNorm || detail.translation !== sessionTrans) return;

      if (detail.action === 'delete') {
        setPassagePaints((prev) => prev.filter((p) => p.id !== detail.threadId));
        return;
      }

      const paint: PassageHighlightPaint = {
        id: detail.threadId,
        excerpt: detail.word,
        accentRaw: detail.accent || 'warmAmber',
        entryKind: 'reference',
      };
      setPassagePaints((prev) => {
        const idx = prev.findIndex((p) => p.id === detail.threadId);
        if (idx < 0) return [...prev, paint];
        const next = [...prev];
        next[idx] = paint;
        return next;
      });
    };
    window.addEventListener('passageStudyPaintChanged', handler);
    return () => window.removeEventListener('passageStudyPaintChanged', handler);
  }, [sourceNoteId, reference, translation, trans]);

  // ── Passage text selection detection ──────────────────────────────────────
  useEffect(() => {
    const scrollEl = passageScrollRef.current;
    if (!scrollEl || !isExpanded || !interactionActive) return;

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
      if (!sel || sel.rangeCount === 0) {
        setPassageSelection(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!scrollEl.contains(range.commonAncestorContainer)) {
        setPassageSelection(null);
        return;
      }
      if (sel.isCollapsed) {
        setPassageSelection(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setPassageSelection(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setPassageSelection({ text, rect });
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
  }, [isExpanded, interactionActive]);

  const handleCreatePassageHighlight = useCallback(async () => {
    if (!passageSelection || !sourceNoteId || creatingHighlight) return;
    setCreatingHighlight(true);
    // Native parity (`beginPassageHighlightDraft`): seed from the pill accent when set and
    // non-neutral, else warm amber.
    const seedAccent: StudyHighlightAccentKey =
      initialPillAccent && isStudyHighlightAccentKey(initialPillAccent) && initialPillAccent !== 'neutral'
        ? initialPillAccent
        : 'warmAmber';
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
          highlightAccentRaw: seedAccent,
          sourceSnippet: passageSelection.text,
          focusTitle: passageSelection.text.slice(0, 80),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const threadId: string | null = data.studyThread?.id ?? null;
        if (threadId) {
          // Paint the new highlight inline immediately (native parity — no list UI).
          setPassagePaints((prev) => [
            ...prev,
            {
              id: threadId,
              excerpt: passageSelection.text,
              accentRaw: seedAccent,
              entryKind: 'scriptureLink',
            },
          ]);
          onPassageHighlightCreated?.(passageSelection.text, threadId, seedAccent);
        }
      }
    } catch {
      /* ignore — paints will still reflect server state on next load */
    }
    setPassageSelection(null);
    window.getSelection()?.removeAllRanges();
    setCreatingHighlight(false);
  }, [passageSelection, sourceNoteId, creatingHighlight, displayRefString, trans, onPassageHighlightCreated, initialPillAccent]);
  // ──────────────────────────────────────────────────────────────────────────

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
      if (!prev) {
        setVerseEnd(verseStart);
        setEndChapter(chapter);
      } else {
        // Collapsing to a single verse drops any cross-chapter end.
        setEndChapter(chapter);
      }
      return !prev;
    });
  }, [verseStart, chapter]);

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
        <>
          <button
            type="button"
            className={`study-dock-card__header-btn${showCrossRefs ? ' study-dock-card__header-btn--active' : ''}`}
            onClick={() => setShowCrossRefs((v) => !v)}
            title={showCrossRefs ? 'Hide cross-references' : 'Show cross-references'}
            aria-pressed={showCrossRefs}
            aria-label={showCrossRefs ? 'Hide cross-references' : 'Show cross-references'}
          >
            <Icon name="shuffle" size={12} />
          </button>
          {onPillAccentChange ? (
            <DockAccentSwatchButton selection={selectedSwatchKey} onSelectionChange={onPillAccentChange} />
          ) : null}
        </>
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
            // Only keep the end verse ahead of the start within the same chapter.
            setVerseEnd((end) => (useVerseRange && endChapter === chapter && end < v ? v : end));
          }}
          endChapter={endChapter}
          endChapterNums={endChapterNums}
          onEndChapterChange={setEndChapter}
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
        aria-busy={loadingPassage}
        // tabIndex=-1 makes this a valid focus target on click so the browser
        // doesn't bounce focus back to the editor, allowing text selection.
        tabIndex={-1}
        onMouseDown={handlePassageMouseDown}
        onClick={handlePassageClick}
      >
        <div ref={passageContentRef} className="scripture-pill-chrome__passage-inner">
          {loadingPassage ? (
            <p className="scripture-pill-chrome__passage-status">Loading passage…</p>
          ) : passageHtml ? (
            <div
              className="scripture-pill-chrome__passage-html"
              dangerouslySetInnerHTML={passageHtmlMarkup}
            />
          ) : (
            <p className="scripture-pill-chrome__passage-status">Could not load this passage.</p>
          )}
          {interactionActive && isExpanded && passageHtml ? (
            <PassageContextStrip
              reference={displayRefString}
              translation={trans}
              sourceNoteId={sourceNoteId}
              active={interactionActive && isExpanded}
              showCrossRefs={showCrossRefs}
              onOpenScripturePassage={(ref) => onOpenScripturePassage?.(ref, trans)}
              onOpenEntity={(name, slug) => onOpenPassageReference?.(name, { slug })}
              onNavigateNote={onNavigateNote}
            />
          ) : null}
          {translationInfo ? (
            <p className="scripture-pill-chrome__attribution-subtle">{translationInfo.copyright}</p>
          ) : null}
        </div>
      </div>
    </StudyDockCardShell>
    {/* Floating passage highlight action bar — portal to document.body to escape scroll clip */}
    {passageSelection && sourceNoteId && passageHtml && !readOnly && typeof document !== 'undefined'
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
              // Run on mousedown (StudyDockCardShell pattern): a re-render between mouseup and
              // click re-applies the Icon's inner SVG, detaching the press target so the browser
              // never dispatches click. preventDefault also keeps the text selection alive.
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                void handleCreatePassageHighlight();
              }}
              onClick={(e) => {
                /* Keyboard activation only — mouse runs on mousedown (detail 0 = key). */
                if (e.detail === 0) void handleCreatePassageHighlight();
              }}
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
