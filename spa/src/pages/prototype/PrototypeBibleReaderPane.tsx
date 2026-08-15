/**
 * The Bible reader — a main-pane document, peer of the note editor.
 *
 * Chrome recedes so Scripture leads. Design + states live in the gallery
 * (`/__dev/design-system` → ds-14-reader); this renders the real chapter into
 * those `.pds-reader-*` classes.
 *
 * Selection is per verse, not per character: a verse is the unit a margin note
 * anchors to and a highlight is stored against, so the reading surface offers
 * the same unit the data model uses.
 */
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
} from 'react';
import Icon from '@/components/react/Icon';
import { PrototypePaneEmptyState } from './design-system';
import {
  usePrefetchAdjacentChapters,
  usePrototypeBibleChapter,
} from '../../hooks/queries/usePrototypeBibleChapter';
import {
  getReadingPrefsServerSnapshot,
  getReadingPrefsSnapshot,
  subscribeReadingPrefs,
} from '../../lib/proto-reading-prefs';
import { FONT_STACKS, type FontChoice } from '../../lib/proto-font-prefs';
import { createPortal } from 'react-dom';
import {
  STUDY_HIGHLIGHT_ACCENT_LABELS,
  STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL,
  type StudyHighlightAccentKey,
} from '@/utils/study-highlight-accents';
import { useProtoShell } from '../../layouts/proto-shell-context';
import {
  createDictionaryReferenceProvider,
  decoratePassageHtmlWithReferenceSuggestions,
  type ReferenceProvider,
} from '@/components/react/TiptapReferenceSuggestion';
import { useEastonsSlugIndex } from '../../hooks/useEastonsSlugIndex';
import {
  assignAnchorLanes,
  usePrototypeChapterNotes,
} from '../../hooks/queries/usePrototypeChapterNotes';
import ReferenceDockWeb from '@/components/react/ReferenceDockWeb';
import ScripturePillChromeWeb from '@/components/react/ScripturePillChromeWeb';
import HighlightDockWeb from '@/components/react/HighlightDockWeb';

/**
 * What the reader currently has open in the shell's study dock.
 *
 * The reader has no dock of its own. A scripture dock IS a snippet view of this reader, so a
 * reader-only panel would be a second, lesser copy of a surface that already exists — and one
 * that answers the same questions in a different shape. These are the same dock components a
 * note opens, in the same place, so what you learn about a passage in one is what you see in
 * the other.
 */
type ReaderDockState =
  | { kind: 'reference'; query: string }
  | { kind: 'passage'; reference: string }
  | { kind: 'highlight'; reference: string; excerpt: string; accent: StudyHighlightAccentKey }
  | null;

/** Breathing room above and below the passage a note card holds up. */
const CARD_BLEED = 6;

/** Text → HTML, so a verse can carry suggestion spans without carrying anything else. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A highlight resting on the chapter, keyed by the verse it covers. */
export type ReaderVerseHighlight = {
  accent: StudyHighlightAccentKey;
  /** Present when the highlight carries an annotation — the dock has something to open. */
  studyThreadEntryId?: string | null;
};

export interface PrototypeBibleReaderPaneProps {
  book: string;
  chapter: number;
  translation: string;
  /** Verse to land on, e.g. from a deep link or a margin dot. */
  focusVerse?: number;
  onNavigateChapter?: (nextChapter: number) => void;
  /**
   * Start a note from the selected verses. Omitted when the reader is the base of a
   * paper stack — a note is already open above it, so offering to start another there
   * would stack a sheet on a sheet.
   */
  onStartNote?: (range: { start: number; end: number }) => void;
  /** Open the passage-context dock for a reference. Omitted on the paper stack's base. */
  onOpenDock?: (reference: string) => void;
  /** Session face from the inspector; unset follows the Appearance default. */
  fontOverride?: FontChoice | null;
  /**
   * Highlights already on this chapter, by verse number — whether they were made here or in
   * a note's scripture dock. The reader does not own them and does not fetch them; it paints
   * what it is given, which is what keeps the two surfaces one layer instead of two.
   */
  highlights?: ReadonlyMap<number, ReaderVerseHighlight>;
  /** Paint the selected verses in this accent. */
  onHighlight?: (range: { start: number; end: number }, accent: StudyHighlightAccentKey) => void;
  /** Highlight, then open the study dock on it so a thought can be written straight away. */
  onAnnotate?: (range: { start: number; end: number }, accent: StudyHighlightAccentKey) => void;
  /** Open a margin note, with its scripture dock already on the passage the bar marked. */
  onOpenNoteAtReference?: (noteId: string, reference: string) => void;
}

export default function PrototypeBibleReaderPane({
  book,
  chapter,
  translation,
  focusVerse,
  onNavigateChapter,
  onStartNote,
  onOpenDock,
  fontOverride,
  highlights,
  onHighlight,
  onAnnotate,
  onOpenNoteAtReference,
}: PrototypeBibleReaderPaneProps) {
  const { data, isLoading, isError, error } = usePrototypeBibleChapter(book, chapter, translation);
  const { verseLayout, showMarginNotes } = useSyncExternalStore(
    subscribeReadingPrefs,
    getReadingPrefsSnapshot,
    getReadingPrefsServerSnapshot,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** Colour the next highlight lands in — a bar setting, not a per-verse one. */
  const [accent, setAccent] = useState<StudyHighlightAccentKey>('warmAmber');
  /**
   * Verse actions float at the selection; the shell's bottom bar is left alone.
   *
   * The bar is a MODE, not a place for whatever the current surface can do — it is the
   * formatting bar because a note is being typed in. Filling it with verse actions spends the
   * one piece of persistent chrome on something a transient selection already implies, and
   * leaves nothing for the modes worth putting there (review, challenges). Actions belong
   * where the thing they act on is.
   */
  const { studyDockCarouselHostEl } = useProtoShell();


  /* Warm the neighbours so paging through a book never shows a loading line. */
  usePrefetchAdjacentChapters(book, chapter, translation, {
    hasPrev: data?.hasPrevChapter,
    hasNext: data?.hasNextChapter,
  });

  const verses = useMemo(() => data?.verses ?? [], [data]);

  /**
   * Dictionary suggestions inside the Scripture itself — the dotted underlines a note body and
   * a scripture dock already show. Same decorator, same provider, so a word that hints in a
   * dock hints here; a study Bible's cross-reference marks, on the passage rather than beside it.
   */
  const { data: eastonsIndex } = useEastonsSlugIndex();
  const referenceProviders = useMemo<ReferenceProvider[]>(
    () => [createDictionaryReferenceProvider(() => eastonsIndex)],
    [eastonsIndex],
  );

  /**
   * Decorated markup per verse, built once per chapter rather than per render.
   *
   * The `{ __html }` objects have to be stable: a fresh object each render makes React
   * re-apply innerHTML every time, which destroys any text selection the reader is holding —
   * the same bug that bit the note body. Memoizing the whole map keeps them identity-stable.
   */
  const verseHtml = useMemo(() => {
    const map = new Map<number, { __html: string }>();
    for (const verse of verses) {
      const escaped = escapeHtml(verse.text);
      map.set(verse.number, {
        __html: eastonsIndex
          ? decoratePassageHtmlWithReferenceSuggestions(escaped, referenceProviders)
          : escaped,
      });
    }
    return map;
  }, [verses, eastonsIndex, referenceProviders]);

  /**
   * Notes anchored to verses in this chapter, laid out as bars in lanes.
   *
   * Read-only: opening a chapter must never touch a note. `updatedAt` is both the sort key and
   * the sync watermark here, so a write on read would silently re-sort the sidebar — a bug
   * this codebase has had more than once.
   */
  const { data: chapterAnchors } = usePrototypeChapterNotes(book, chapter);
  const anchorLanes = useMemo(
    () => (showMarginNotes ? assignAnchorLanes(chapterAnchors, verses.length) : []),
    [chapterAnchors, verses.length, showMarginNotes],
  );

  /** What the shell's study dock is showing on behalf of the reader; null when closed. */
  const [dock, setDock] = useState<ReaderDockState>(null);
  /** The menu is showing colours for the highlight just made, rather than the action list. */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** Selected verse range, as [start, end] — a range because selection can extend. */
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [focusedVerse, setFocusedVerse] = useState<number | null>(null);

  // A new chapter is a new document: keep no selection or roving focus from the
  // last one, or verse 12 of John 3 stays lit while reading John 4.
  useEffect(() => {
    setSelection(null);
    setFocusedVerse(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [book, chapter, translation]);

  /**
   * Margin bars, measured rather than laid out.
   *
   * The obvious approach — a gutter cell in each block's grid — only works in `lines` layout,
   * where a block IS a verse. In `prose` the whole chapter is one paragraph, so there is no
   * per-verse box for a grid cell to sit beside, and a bar would land against the paragraph
   * rather than against verses 1–3.
   *
   * So the bars live in one absolutely-positioned layer and take their extent from client
   * rects: the top of the start verse's FIRST rect down to the bottom of the end verse's LAST
   * rect. Both ends matter — a verse that wraps across four lines has four rects, and using
   * the bounding box instead would start the bar at the wrong line whenever a range begins
   * mid-paragraph. One mechanism serves both layouts, re-measured whenever the text reflows:
   * layout mode, text size, typeface, or column width all move the lines a range spans.
   */
  const columnRef = useRef<HTMLDivElement | null>(null);
  type MarginBar = {
    key: string;
    top: number;
    height: number;
    lane: number;
    startVerse: number;
    endVerse: number;
    reference: string;
    notes: { noteId: string; title: string }[];
    label: string;
    heat: number;
  };
  const [bars, setBars] = useState<MarginBar[]>([]);

  useEffect(() => {
    const column = columnRef.current;
    if (!column || anchorLanes.length === 0) {
      setBars([]);
      return;
    }
    const measure = () => {
      const base = column.getBoundingClientRect().top;
      const next: MarginBar[] = [];
      for (const a of anchorLanes) {
        const startEl = column.querySelector(`[data-reader-verse="${a.startVerse}"]`);
        const endEl = column.querySelector(`[data-reader-verse="${a.endVerse}"]`);
        if (!(startEl instanceof HTMLElement) || !(endEl instanceof HTMLElement)) continue;
        const startRects = startEl.getClientRects();
        const endRects = endEl.getClientRects();
        const first = startRects[0];
        const last = endRects[endRects.length - 1];
        if (!first || !last) continue;
        const notes = a.notes.map((n) => ({
          noteId: n.noteId,
          title: n.title?.trim() || 'Untitled note',
        }));
        next.push({
          key: `${a.startVerse}-${a.endVerse}:${a.lane}`,
          top: Math.round(first.top - base),
          height: Math.max(4, Math.round(last.bottom - first.top)),
          lane: a.lane,
          startVerse: a.startVerse,
          endVerse: a.endVerse,
          reference: a.reference,
          notes,
          label:
            notes.length > 1
              ? `${notes.length} notes — ${a.reference}`
              : `${notes[0]?.title ?? 'Note'} — ${a.reference}`,
          // Same discrete buckets the church heatmap uses, so "more here" reads the same way
          // across the app. One note is the base weight; the ramp starts above that.
          heat: Math.min(4, a.mergedCount),
        });
      }
      setBars(next);
    };
    const raf = requestAnimationFrame(measure);
    // Width, text size and typeface all reflow the column; a bar measured against the old
    // flow spans the wrong lines. Observing the column catches all three.
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [anchorLanes, verseLayout, verses]);

  /**
   * The bar being pointed at or pinned — the note whose card is showing.
   *
   * Hover reveals it and leaving hides it again; a tap pins it, because on touch there is no
   * hover to hold and the card carries an action worth aiming at. Pinning also survives the
   * pointer crossing the gap between the gutter and the card.
   */
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);

  /*
   * Derived from the live bars, never stored.
   *
   * Holding the bar object itself froze its measurements at the moment of hover, so a card
   * left open while the text reflowed — a typeface swap, a text-size change, the sidebar
   * opening — kept pointing at where the passage used to be. Looking it up by key each render
   * means a re-measure flows straight through to the open card.
   */
  const activeBar = activeKey ? (bars.find((b) => b.key === activeKey) ?? null) : null;

  /**
   * Where the floating menu sits — under the last selected verse, in viewport coordinates.
   *
   * Re-measured on scroll and resize because the menu is `position: fixed` (so it is never
   * clipped by the scroller) while its anchor moves with the text.
   */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const selectionEnd = selection?.[1] ?? null;

  useEffect(() => {
    if (selectionEnd == null) {
      setMenuPos(null);
      // A new selection starts at the action list; the palette belonged to the last highlight.
      setPaletteOpen(false);
      return;
    }
    const place = () => {
      const el = scrollRef.current?.querySelector(`[data-reader-verse="${selectionEnd}"]`);
      if (!(el instanceof HTMLElement)) return;
      const rects = el.getClientRects();
      // Last rect, not the bounding box: a verse that wraps spans several lines, and the
      // menu belongs under the line the selection actually ends on.
      const rect = rects[rects.length - 1] ?? el.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    };
    place();
    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scroller?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [selectionEnd]);

  // Land on the deep-linked verse once its element exists.
  useEffect(() => {
    if (!focusVerse || verses.length === 0) return;
    const el = document.querySelector<HTMLElement>(`[data-reader-verse="${focusVerse}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    setSelection([focusVerse, focusVerse]);
    setFocusedVerse(focusVerse);
  }, [focusVerse, verses.length]);

  const selectVerse = useCallback((num: number, extend: boolean) => {
    setSelection((current) => {
      if (extend && current) {
        // Shift-click extends from the anchor rather than starting over.
        return [Math.min(current[0], num), Math.max(current[1], num)];
      }
      if (current && current[0] === num && current[1] === num) return null;
      return [num, num];
    });
  }, []);

  const moveFocus = useCallback(
    (from: number, delta: number) => {
      const i = verses.findIndex((v) => v.number === from);
      if (i === -1) return;
      const next = verses[Math.min(verses.length - 1, Math.max(0, i + delta))];
      setFocusedVerse(next.number);
      document.querySelector<HTMLElement>(`[data-reader-verse="${next.number}"]`)?.focus();
    },
    [verses],
  );

  const rovingVerse = focusedVerse ?? verses[0]?.number ?? null;

  if (isLoading) {
    // Deliberately no skeleton: the design system prefers real content arriving
    // over placeholder geometry that guesses a chapter's shape.
    return (
      <div className="pds-reader">
        <div className="pds-reader__scroll">
          <div className="pds-reader__column">
            <p className="pds-caption">Loading {book} {chapter}…</p>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const code = (error as { code?: string } | null)?.code;
    const outOfRange = code === 'CHAPTER_OUT_OF_RANGE';
    const missing = code === 'CHAPTER_NOT_FOUND';
    return (
      <div className="pds-reader">
        <PrototypePaneEmptyState
          icon={missing ? 'cloud' : 'scroll'}
          title={
            outOfRange
              ? `${book} doesn't have a chapter ${chapter}`
              : missing
                ? `${translation} doesn't include ${book} ${chapter}`
                : "That chapter didn't load"
          }
          description={
            missing
              ? 'Try another translation for this passage.'
              : outOfRange
                ? 'Pick a chapter from this book to keep reading.'
                : 'Check your connection and try again.'
          }
        />
      </div>
    );
  }

  /**
   * One verse, identical in both layouts.
   *
   * Defined here rather than at module scope so it closes over selection and focus without
   * threading six props through; both call sites render the same element either way.
   */
  const VerseSpan = ({ verse }: { verse: { number: number; text: string } }) => {
    const selected =
      selection != null && verse.number >= selection[0] && verse.number <= selection[1];
    const highlight = highlights?.get(verse.number);
    return (
      <span
        className="pds-reader__verse"
        role="option"
        data-reader-verse={verse.number}
        aria-selected={selected}
        tabIndex={rovingVerse === verse.number ? 0 : -1}
        data-selected={selected ? 'true' : 'false'}
        data-highlighted={highlight ? 'true' : undefined}
        data-highlight-color={highlight?.accent}
        data-in-focus={
          activeBar && verse.number >= activeBar.startVerse && verse.number <= activeBar.endVerse
            ? 'true'
            : undefined
        }
        onFocus={() => setFocusedVerse(verse.number)}
        onClick={(e) => {
          // A dotted word is its own target: tapping it asks "who/what is this?", which is a
          // different question from "I want to act on this verse". Selecting the verse as well
          // would answer both at once and open the format bar over the dock.
          const suggestion = (e.target as HTMLElement | null)?.closest?.('.reference-suggestion');
          if (suggestion instanceof HTMLElement) {
            e.preventDefault();
            e.stopPropagation();
            const query =
              suggestion.dataset.referenceWord || suggestion.textContent?.trim() || '';
            if (query) setDock({ kind: 'reference', query });
            return;
          }
          selectVerse(verse.number, e.shiftKey);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectVerse(verse.number, e.shiftKey);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(verse.number, 1);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(verse.number, -1);
          }
        }}
      >
        <sup className="pds-reader-verse-num">{verse.number}</sup>
        <span dangerouslySetInnerHTML={verseHtml.get(verse.number) ?? { __html: '' }} />
      </span>
    );
  };

  const selectionLabel =
    selection == null
      ? null
      : selection[0] === selection[1]
        ? `${data.book} ${data.chapter}:${selection[0]}`
        : `${data.book} ${data.chapter}:${selection[0]}-${selection[1]}`;

  /** Text of the selected verses — what a highlight is *of*, for the dock's excerpt. */
  const selectedText =
    selection == null
      ? ''
      : verses
          .filter((v) => v.number >= selection[0] && v.number <= selection[1])
          .map((v) => v.text)
          .join(' ');

  /** One action in the floating menu. */
  const MenuAction = ({
    icon,
    label,
    onClick,
  }: {
    icon: ComponentProps<typeof Icon>['name'];
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      className="pds-native-selection-bar__btn"
      title={`${label} ${selectionLabel ?? ''}`.trim()}
      aria-label={`${label} ${selectionLabel ?? ''}`.trim()}
      onClick={onClick}
    >
      <Icon name={icon} size={16} aria-hidden />
    </button>
  );

  const Divider = () => <span className="pds-native-selection-bar__rule" aria-hidden />;

  const readerToolbar =
    selection && selectionLabel && menuPos
      ? createPortal(
          <div
            className="pds-reader-menu pds-native-selection-bar floating-picker-enter"
            role="group"
            aria-label={`Actions for ${selectionLabel}`}
            style={{ top: menuPos.top, left: menuPos.left }}
            // Keep the verse selection while the menu is used: a press that lands on the menu
            // must not read as a press outside the selection.
            onMouseDown={(e) => e.preventDefault()}
          >
            {paletteOpen && onHighlight ? (
              <>
                {/* Colours for the highlight just made. Back returns to the actions rather
                    than closing, because the verses are still selected and there are three
                    other things you might do with them. */}
                <button
                  type="button"
                  className="pds-native-selection-bar__btn"
                  title="Back to actions"
                  aria-label="Back to actions"
                  onClick={() => setPaletteOpen(false)}
                >
                  <Icon name="caret-left" size={16} aria-hidden />
                </button>
                <Divider />
                {STUDY_HIGHLIGHT_SWATCHES_NO_NEUTRAL.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className={`dock-accent-swatch__choice${accent === token ? ' dock-accent-swatch__choice--selected' : ''}`}
                    title={STUDY_HIGHLIGHT_ACCENT_LABELS[token]}
                    aria-label={STUDY_HIGHLIGHT_ACCENT_LABELS[token]}
                    aria-pressed={accent === token}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      // Re-colours the existing row rather than adding one — the write is
                      // keyed on the passage, so trying colours leaves a single highlight.
                      setAccent(token);
                      onHighlight({ start: selection[0], end: selection[1] }, token);
                    }}
                  >
                    <span className="dock-accent-swatch__choice-ring" aria-hidden />
                    <span
                      className={`dock-accent-swatch__choice-fill dock-accent-swatch__choice-fill--${token}`}
                      aria-hidden
                    />
                  </button>
                ))}
              </>
            ) : (
              <>
            {onHighlight ? (
              <>
                <MenuAction
                  icon="highlighter"
                  label="Highlight"
                  onClick={() => {
                    // Highlight first, ask about colour second. A bare swatch sitting in the
                    // menu was a colour with no stated purpose — it read as decoration until
                    // you guessed what it did. Committing on the first tap means the palette
                    // only ever appears attached to a highlight that already exists, so each
                    // colour is a change you can see rather than a choice you must predict.
                    onHighlight({ start: selection[0], end: selection[1] }, accent);
                    setPaletteOpen(true);
                  }}
                />
                <Divider />
              </>
            ) : null}

            {onAnnotate ? (
              <>
                <MenuAction
                  icon="pen"
                  label="Annotate"
                  onClick={() => {
                    onAnnotate({ start: selection[0], end: selection[1] }, accent);
                    setDock({
                      kind: 'highlight',
                      reference: selectionLabel,
                      excerpt: selectedText,
                      accent,
                    });
                  }}
                />
                <Divider />
              </>
            ) : null}

            <MenuAction
              icon="arrows-turn-to-dots"
              label="Passages"
              onClick={() => setDock({ kind: 'passage', reference: selectionLabel })}
            />

            {onStartNote ? (
              <>
                <Divider />
                <MenuAction
                  icon="note-sticky"
                  label="Note"
                  onClick={() => onStartNote({ start: selection[0], end: selection[1] })}
                />
              </>
            ) : null}
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="pds-reader"
      // Scoped to this element: the override re-points the same var the canvas already
      // reads, so nothing else in the app shifts face.
      style={fontOverride ? ({ '--pds-font-reading': FONT_STACKS[fontOverride] } as CSSProperties) : undefined}
    >
      <div className="pds-reader__scroll" ref={scrollRef}>
        <div className="pds-reader__column" ref={columnRef}>
          <div className="pds-reader__chapter-heading">
            <h1 className="pds-reader-chapter-title">
              {data.book} {data.chapter}
            </h1>
            <p className="pds-reader__chapter-meta pds-caption">{data.translation}</p>
          </div>

          {/*
            Prose is the default because it is how a Bible reads: verses run together and
            the number is a locator inside the flow, not a bullet. `lines` keeps the older
            one-verse-per-block setting for study and annotation.

            Both layouts render the same verse elements with the same roles and handlers —
            only the wrapper differs — so selection, roving focus, and anything that
            anchors to `[data-reader-verse]` behave identically in either.
          */}
          {/* One bar per note, spanning the verses it covers. `aria-hidden` on the layer: every
              bar duplicates a route the verse itself already offers, and a screen reader
              walking the chapter should hear Scripture, not a list of marks interleaved. */}
          {/* The card sits behind the verses it covers, so pointing at a bar lifts exactly
              that passage off the page. Its own layer, below the text in z-order. */}
          {activeBar ? (
            <div
              className="pds-reader__note-card"
              /* CARD_BLEED above and below, so the card holds the passage rather than
                 clipping its first and last lines. */
              style={{ top: activeBar.top - CARD_BLEED, height: activeBar.height + CARD_BLEED * 2 }}
              onMouseEnter={() => setActiveKey(activeBar.key)}
              onMouseLeave={() => {
                if (!pinnedKey) setActiveKey(null);
              }}
            >
              {/* Above the card, never over the words. One row per note, because several
                  notes can cite exactly these verses and picking between them is the whole
                  question the card is answering. */}
              <div className="pds-reader__note-card-chrome">
                {/* Says "note" in words, because a title is often just a date — "August 9,
                    2026" beside a passage reads as a date stamp on the passage, not as
                    something you wrote. The count doubles as the label. */}
                <span className="pds-reader__note-card-ref pds-footnote">
                  {activeBar.notes.length === 1
                    ? 'In your note'
                    : `In ${activeBar.notes.length} of your notes`}
                </span>
                {activeBar.notes.map((note) => (
                  <button
                    key={note.noteId}
                    type="button"
                    className="pds-reader__note-card-item"
                    title={`Open ${note.title}`}
                    aria-label={`Open your note ${note.title}, which cites ${activeBar.reference}`}
                    onClick={() => onOpenNoteAtReference?.(note.noteId, activeBar.reference)}
                  >
                    {/* The note glyph carries the meaning when the title cannot — the same
                        icon the sidebar and Home cards use for a note. */}
                    <Icon name="note-sticky" size={10} aria-hidden />
                    <span className="pds-reader__note-card-item-title">{note.title}</span>
                    {/* Caret, not an external-link glyph: the note opens in place, and that
                        glyph means "leaves the app" everywhere else. Matches the chevron every
                        other navigating row in the app ends with. */}
                    <Icon name="caret-right" size={10} aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="pds-reader__margin" aria-hidden>
            {bars.map((bar) => (
              <button
                key={bar.key}
                type="button"
                className="pds-reader__bar"
                style={
                  {
                    top: bar.top,
                    height: bar.height,
                    '--lane': bar.lane,
                  } as CSSProperties
                }
                data-heat={bar.heat}
                data-active={activeBar?.key === bar.key ? 'true' : undefined}
                tabIndex={-1}
                title={bar.label}
                onMouseEnter={() => {
                  if (!pinnedKey) setActiveKey(bar.key);
                }}
                onMouseLeave={() => {
                  if (!pinnedKey) setActiveKey(null);
                }}
                onClick={() => {
                  // Tap pins; tapping the pinned bar again lets it go.
                  const next = pinnedKey === bar.key ? null : bar.key;
                  setPinnedKey(next);
                  setActiveKey(next);
                }}
              >
                <span className="pds-reader__bar-line" />
              </button>
            ))}
          </div>

          {/* Above the note card. A positioned element paints over in-flow content regardless
              of order, so without this the card would cover the very passage it is holding up. */}
          <div
            className="pds-reader__verses"
            /* With a card up, the rest of the chapter recedes so the passage it holds is the
               only thing in focus. Marking the container rather than each verse keeps it one
               state to reason about — and lets the fade be a single transition. */
            data-focus={activeBar ? 'true' : undefined}
            role="listbox"
            aria-label={`${data.book} ${data.chapter} verses`}
          >
            {verseLayout === 'prose' ? (
              <div className="pds-reader__block" role="none">
                <p className="pds-reader-text" role="none">
                  {verses.map((verse, i) => (
                    <Fragment key={verse.number}>
                      {/* A real space, outside the verse span: it separates verses the way
                          prose does and collapses at a line break, where a CSS margin
                          would survive and indent the line. */}
                      {i > 0 ? ' ' : null}
                      <VerseSpan verse={verse} />
                    </Fragment>
                  ))}
                </p>
              </div>
            ) : (
              verses.map((verse) => (
                <div className="pds-reader__block" role="none" key={verse.number}>
                  <p className="pds-reader-text" role="none">
                    <VerseSpan verse={verse} />
                  </p>
                </div>
              ))
            )}
          </div>

          {onNavigateChapter ? (
            <nav className="pds-reader__chapter-nav" aria-label="Chapter navigation">
              {data.hasPrevChapter ? (
                <button
                  type="button"
                  className="pds-reader__chapter-nav-btn"
                  onClick={() => onNavigateChapter(data.chapter - 1)}
                >
                  <Icon name="arrow-left" size={12} aria-hidden />
                  <span>
                    {data.book} {data.chapter - 1}
                  </span>
                </button>
              ) : (
                <span />
              )}
              {data.hasNextChapter ? (
                <button
                  type="button"
                  className="pds-reader__chapter-nav-btn pds-reader__chapter-nav-btn--next"
                  onClick={() => onNavigateChapter(data.chapter + 1)}
                >
                  <span>
                    {data.book} {data.chapter + 1}
                  </span>
                  <Icon name="arrow-right" size={12} aria-hidden />
                </button>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>

      {readerToolbar}

      {/* Every reader action lands in the shell's study dock — the same components a note
          opens, in the same place. */}
      {dock && studyDockCarouselHostEl
        ? createPortal(
            dock.kind === 'reference' ? (
              <ReferenceDockWeb initialQuery={dock.query} onDone={() => setDock(null)} />
            ) : dock.kind === 'passage' ? (
              <ScripturePillChromeWeb
                reference={dock.reference}
                translation={translation}
                // No pill to write back to: the passage is already the document behind this
                // dock, so editing the reference here would mean editing what you are reading.
                readOnly
                editorChromeMode="prototypeNative"
                onDone={() => setDock(null)}
                onApply={() => undefined}
                onOpenPassageReference={(word) => setDock({ kind: 'reference', query: word })}
                onOpenScripturePassage={(ref) => onOpenDock?.(ref)}
              />
            ) : (
              <HighlightDockWeb
                accent={dock.accent}
                excerpt={dock.excerpt}
                focusTitle={dock.reference}
                entryKind="scriptureLink"
                onAccentChange={(next) => {
                  setAccent(next);
                  if (selection) onHighlight?.({ start: selection[0], end: selection[1] }, next);
                  setDock({ ...dock, accent: next });
                }}
                onRemove={() => setDock(null)}
                onDone={() => setDock(null)}
              />
            ),
            studyDockCarouselHostEl,
          )
        : null}
    </div>
  );
}
