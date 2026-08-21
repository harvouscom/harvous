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
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import Icon from '@/components/react/Icon';
import { nextVerseSelection } from './reader-verse-selection';
// For `.scripture-pill-chrome__trans-chip` — the reader states the translation in the
// same chip the dock does, so it borrows the chip rather than growing a second one.
import '@/styles/scripture-pill-chrome.css';
import ProtoSelectMenu from './ProtoSelectMenu';
import {
  adjacentChapter,
  bookChapterCount,
  orderedCanonBooks,
} from '@/utils/bible-book-chapters';
import { canonGroupForBook } from '@/utils/admin-pulse-canon-groups';
import { bookAbbreviation } from '@/utils/scripture-osis';
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
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import {
  assignAnchorLanes,
  usePrototypeChapterNotes,
} from '../../hooks/queries/usePrototypeChapterNotes';
import {
  isOptimisticChapterHighlightId,
  chapterReferenceLookupKey,
} from '../../hooks/queries/usePrototypeChapterHighlights';
import type { SavedReference } from '../../hooks/queries/usePrototypeChapterHighlights';
import ReferenceDockWeb from '@/components/react/ReferenceDockWeb';
import ScripturePillChromeWeb from '@/components/react/ScripturePillChromeWeb';
import HighlightDockWeb from '@/components/react/HighlightDockWeb';
import { useSettledFlag } from '../../hooks/useSettledFlag';

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
  /** `anchor` is where the word was read, and it is what a saved reference points back at:
      the single verse when the word was tapped in the chapter, the whole passage when it was
      tapped inside a passage card. `verse` is set only in the first case — it is the verse a
      newly started note returns the reader to, and a passage has no single one. */
  | {
      kind: 'reference';
      query: string;
      anchor: string;
      verse?: number;
      /** Set when this exact (anchor, word) already has a saved reference — the dock opens
          straight into "saved" chrome instead of showing Save again over one that already is. */
      savedReferenceId?: string | null;
    }
  | { kind: 'passage'; reference: string }
  | {
      kind: 'highlight';
      reference: string;
      excerpt: string;
      accent: StudyHighlightAccentKey;
      /** Null until `onAnnotate`'s create request resolves — see the click handler below. */
      studyThreadEntryId: string | null;
      /** Seeded from the existing row when reopening one, so the note box isn't blank over it. */
      miniNoteBody: string;
    }
  | null;

/** Breathing room above and below the passage a note card holds up. */
const CARD_BLEED = 6;

/**
 * How much clear space the "In your note" chrome needs above the card before it fits without
 * covering anything — its own ~27px row plus the 6px gap `bottom: calc(100% + 6px)` opens
 * above the card. A bar on verse 1 has nothing but the chapter heading above it, so below
 * that clearance the chrome flips underneath the card instead (`data-chrome-placement`).
 */
const CHROME_CLEARANCE = 36;

/**
 * How long a chapter may take to arrive before the reader admits it is waiting.
 *
 * Prefetching covers the chapters either side, but a jump straight to somewhere unvisited —
 * a book chosen from the title, a shared link — still fetches. Those land in tens of
 * milliseconds, and a loading line shown for 40ms is not information, it is a flash. Past
 * this threshold there genuinely is a wait, and saying so is better than a frozen page.
 */
/** Stable stand-in for a verse whose html has not been built — a fresh `{}` here would
    defeat the memo below on every render, which is the whole point of hoisting it. */
const EMPTY_VERSE_HTML = { __html: '' };

/**
 * One verse, identical in both layouts.
 *
 * At module scope, and memoised, because it must not be re-created per render. It used to
 * be declared inside the pane so it could close over selection and focus without threading
 * props — which gave it a new function identity every render, so React treated it as a
 * different component type and unmounted the entire verse subtree on ANY state change.
 *
 * That is what made a dotted word need two taps: the first mousedown focused the verse,
 * `setFocusedVerse` re-rendered, every verse node was replaced, and mouseup landed on a
 * node that had never seen the mousedown — so no click was ever dispatched. The second tap
 * worked only because the focus state was already correct and React bailed out of the
 * render. It also threw away any drag text-selection across verses, and defeated the
 * memoised `verseHtml` that exists precisely to keep this DOM stable.
 *
 * Everything it needs now arrives as props, and every handler takes the verse number so the
 * parent can hold one stable callback for all of them.
 */
const VerseSpan = memo(function VerseSpan({
  verse,
  selected,
  accent,
  inFocus,
  roving,
  html,
  onFocusVerse,
  onActivate,
  onKeys,
}: {
  verse: { number: number; text: string };
  selected: boolean;
  accent?: string;
  inFocus: boolean;
  roving: boolean;
  html: { __html: string };
  onFocusVerse: (n: number) => void;
  onActivate: (n: number, e: ReactMouseEvent<HTMLSpanElement>) => void;
  onKeys: (n: number, e: ReactKeyboardEvent<HTMLSpanElement>) => void;
}) {
  return (
    <span
      className="pds-reader__verse"
      role="option"
      data-reader-verse={verse.number}
      aria-selected={selected}
      tabIndex={roving ? 0 : -1}
      data-selected={selected ? 'true' : 'false'}
      data-highlighted={accent ? 'true' : undefined}
      data-highlight-color={accent}
      data-in-focus={inFocus ? 'true' : undefined}
      onFocus={() => onFocusVerse(verse.number)}
      onClick={(e) => onActivate(verse.number, e)}
      onKeyDown={(e) => onKeys(verse.number, e)}
    >
      <sup className="pds-reader-verse-num">{verse.number}</sup>
      <span className="pds-reader__verse-text" dangerouslySetInnerHTML={html} />
    </span>
  );
});

const LOADING_GRACE_MS = 250;

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
  /** The row's id — every highlight is one, so the toolbar can reopen rather than recreate. */
  studyThreadEntryId?: string | null;
  /** Whatever note was typed into it already, so reopening doesn't show a blank box over it. */
  miniNoteBody?: string;
};

export interface PrototypeBibleReaderPaneProps {
  book: string;
  chapter: number;
  translation: string;
  /** Verse to land on, e.g. from a deep link or a margin dot. */
  focusVerse?: number;
  /** End of a ranged arrival; the focus covers `focusVerse`..`focusVerseEnd` inclusive. */
  focusVerseEnd?: number;
  /**
   * Go to a chapter, in any book. Book-aware rather than chapter-only: reading runs past a
   * book's end, and prev/next that could not name a book dead-ended at every one of them.
   */
  onNavigateTo?: (book: string, chapter: number) => void;
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
  /**
   * Paint the selected verses in this accent.
   *
   * `excerpt` is the selected verses' own text — required server-side for a `scriptureLink`
   * row to be eligible for the sidebar's Highlights list at all (see
   * `studyThreadEligibleForHighlightList`), not just decoration. Built here rather than
   * passed down, because this component already holds the verse text the selection covers.
   */
  onHighlight?: (
    range: { start: number; end: number },
    accent: StudyHighlightAccentKey,
    excerpt: string,
  ) => void;
  /**
   * Highlight, then open the study dock on it so a thought can be written straight away.
   *
   * Returns the created row's id (or `null` on failure) — the dock opens before this settles,
   * so the reader threads the id back in once it resolves, letting the dock's own pending-edit
   * flush pick up whatever was typed in the meantime.
   */
  onAnnotate?: (
    range: { start: number; end: number },
    accent: StudyHighlightAccentKey,
    excerpt: string,
  ) => Promise<string | null> | void;
  /** Delete the row behind an open highlight dock — the "Remove highlight" trash icon. */
  onRemoveHighlight?: (studyThreadEntryId: string) => void;
  /** Open a margin note, with its scripture dock already on the passage the bar marked. */
  onOpenNoteAtReference?: (noteId: string, reference: string) => void;
  /**
   * Warm the note query cache before the tap that opens it — fired as soon as a margin bar
   * becomes active (hover or pin) and again on pointer-down/focus of one of its note rows, so
   * the fetch is already in flight by the time `onOpenNoteAtReference` navigates there.
   */
  onPrefetchNote?: (noteId: string) => void;
  /**
   * Keep a looked-up word as a reference, and what to call doing so.
   *
   * The reader can show you what a word means but has no note of its own to keep it in — a
   * saved reference is an entry on a note's study thread. So the page above decides where
   * it lands and names the action accordingly, and the pane only reports the word and where
   * it was read. Omitted while a chapter is the base of a paper stack: the note on top owns
   * the saving there, and two Save buttons for one word is a question nobody asked.
   */
  /**
   * Resolves false when the save did not take (offline, not-yet-ready space, server error) —
   * the dock stays open on false instead of dismissing over a save that silently did nothing.
   */
  onSaveReference?: (input: {
    word: string;
    reference: string;
    verse?: number;
  }) => Promise<boolean> | boolean | void;
  saveReferenceLabel?: string;
  /**
   * Every saved word look-up on this chapter, keyed by `chapterReferenceLookupKey(reference,
   * word)`. Looked up when a word's card opens so a previously-saved one shows "saved" chrome
   * immediately rather than the pending Save button it would show if this were absent.
   */
  savedReferences?: ReadonlyMap<string, SavedReference>;
  /**
   * Filled with the verse currently at the top of the view, tagged with the chapter it belongs
   * to. The reading log reads it when a session ends so continuing lands where you stopped
   * rather than at verse 1.
   */
  visiblePositionRef?: React.MutableRefObject<{ book: string; chapter: number; verse: number } | null>;
  /**
   * Open a looked-up word's card on arrival, for a saved reference tapped somewhere else.
   *
   * `requestKey` is what makes it repeatable: the dock is dismissible, so opening the same
   * word twice has to be two requests rather than one piece of state that is already set.
   */
  referenceRequest?: { word: string; anchor: string; verse?: number; requestKey: string } | null;
  /**
   * Changes when the same verse is asked for again, so arriving twice lands twice.
   *
   * Landing keys off `focusVerse`, which does not change when you re-open the passage you are
   * already on — and by then you may have cleared the landing with a stray tap, so the second
   * ask did nothing at all.
   */
  landRequestKey?: string;
}

export default function PrototypeBibleReaderPane({
  book,
  chapter,
  translation,
  focusVerse,
  focusVerseEnd,
  onNavigateTo,
  onStartNote,
  onOpenDock,
  fontOverride,
  highlights,
  onHighlight,
  onAnnotate,
  onRemoveHighlight,
  onOpenNoteAtReference,
  onPrefetchNote,
  onSaveReference,
  saveReferenceLabel,
  savedReferences,
  visiblePositionRef,
  referenceRequest,
  landRequestKey,
}: PrototypeBibleReaderPaneProps) {
  const { data, isLoading, isError, error } = usePrototypeBibleChapter(book, chapter, translation);
  const { verseLayout, showMarginNotes } = useSyncExternalStore(
    subscribeReadingPrefs,
    getReadingPrefsSnapshot,
    getReadingPrefsServerSnapshot,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /* Only say "loading" once the wait is real — see LOADING_GRACE_MS. */
  const showLoading = useSettledFlag(isLoading, LOADING_GRACE_MS);
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


  /* Warm the neighbours so paging never shows a loading line — across books, too. */
  usePrefetchAdjacentChapters(book, chapter, translation);

  /*
   * Remember this was read — but only once it has arrived. Logging a chapter the reader is
   * still waiting for would record intent rather than reading, and a chapter this translation
   * does not carry would record a page that showed nothing.
   */

  const verses = useMemo(() => data?.verses ?? [], [data]);

  /* Options for the heading pickers, and where prev/next actually lead. */
  /*
   * The canon as a grid of short names, split by testament.
   *
   * Sixty-six full titles down one column is a long scroll for a list everyone already knows
   * the shape of. Abbreviated, the whole of either testament fits in a glance, and the
   * testament toggle means the half you want is never behind the half you don't. Labels are
   * OSIS codes, which the app already stores books under — Judg/Jude and Phil/Phlm stay
   * distinct, which a three-letter scheme would collapse.
   */
  const bookOptions = useMemo(
    () =>
      orderedCanonBooks().map((b) => ({
        value: b,
        label: bookAbbreviation(b),
        // The grid abbreviates; the chapter's own title must not.
        triggerLabel: b,
        group: canonGroupForBook(b)?.testament === 'nt' ? 'New Testament' : 'Old Testament',
      })),
    [],
  );
  const chapterOptions = useMemo(() => {
    const count = bookChapterCount(book) ?? data?.chapterCount ?? 1;
    return Array.from({ length: count }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
  }, [book, data?.chapterCount]);
  const prevChapter = useMemo(() => adjacentChapter(book, chapter, -1), [book, chapter]);
  const nextChapter = useMemo(() => adjacentChapter(book, chapter, 1), [book, chapter]);

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
   * Mark already-saved words in the passage text with a solid underline instead of the dotted
   * "not yet kept" one. The `.reference-suggestion` spans live inside `verseHtml`'s static
   * markup (memoised above precisely so a fresh object per render doesn't tear out a live text
   * selection), so this reaches into the rendered DOM directly rather than regenerating that
   * HTML every time a save changes what's already saved.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const spans = container.querySelectorAll<HTMLElement>('.reference-suggestion');
    spans.forEach((span) => {
      const verseNumber = span.closest<HTMLElement>('[data-reader-verse]')?.dataset.readerVerse;
      const word = span.dataset.referenceWord || span.textContent?.trim();
      const saved =
        verseNumber && word
          ? savedReferences?.get(
              chapterReferenceLookupKey(`${book} ${chapter}:${verseNumber}`, word),
            )
          : undefined;
      if (saved) {
        span.setAttribute('data-reference-saved', 'true');
        // Its own accent, not the verse's: this span sits inside `.pds-reader__verse`, which
        // sets `--mark-accent` for the verse's highlight, so a reference reading that variable
        // would take on whatever colour the verse around it happens to be highlighted in.
        span.setAttribute('data-reference-accent', saved.accent);
      } else {
        span.removeAttribute('data-reference-saved');
        span.removeAttribute('data-reference-accent');
      }
    });
  }, [book, chapter, savedReferences, verseHtml]);

  /**
   * Notes anchored to verses in this chapter, laid out as bars in lanes.
   *
   * Read-only: opening a chapter must never touch a note. `updatedAt` is both the sort key and
   * the sync watermark here, so a write on read would silently re-sort the sidebar — a bug
   * this codebase has had more than once.
   */
  // The space id only feeds the offline fallback — the mirrored scripture index is per space.
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const { data: chapterAnchors } = usePrototypeChapterNotes(book, chapter, homeSpaceId);
  const anchorLanes = useMemo(
    () => (showMarginNotes ? assignAnchorLanes(chapterAnchors, verses.length) : []),
    [chapterAnchors, verses.length, showMarginNotes],
  );

  /** What the shell's study dock is showing on behalf of the reader; null when closed. */
  const [dock, setDock] = useState<ReaderDockState>(null);

  /** The saved row for this exact (anchor, word), if a Save already went through for it. */
  const lookupSavedReferenceId = useCallback(
    (anchor: string, word: string): string | null =>
      savedReferences?.get(chapterReferenceLookupKey(anchor, word))?.id ?? null,
    [savedReferences],
  );

  /*
   * Honour an arrival request to open a word's card. Keyed on the request's nonce rather than
   * its contents, so tapping the same saved reference again reopens the card after it has
   * been dismissed.
   */
  const lastReferenceRequestKey = useRef<string | null>(null);
  useEffect(() => {
    if (!referenceRequest?.word || !referenceRequest.requestKey) return;
    if (lastReferenceRequestKey.current === referenceRequest.requestKey) return;
    lastReferenceRequestKey.current = referenceRequest.requestKey;
    setDock({
      kind: 'reference',
      query: referenceRequest.word,
      anchor: referenceRequest.anchor,
      verse: referenceRequest.verse,
      savedReferenceId: lookupSavedReferenceId(referenceRequest.anchor, referenceRequest.word),
    });
  }, [referenceRequest, lookupSavedReferenceId]);
  /** The menu is showing colours for the highlight just made, rather than the action list. */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /** Selected verse range, as [start, end] — a range because selection can extend. */
  const [selection, setSelection] = useState<[number, number] | null>(null);
  const [focusedVerse, setFocusedVerse] = useState<number | null>(null);

  /**
   * Where a deep link put you — dimmed-in like a selection, but not one.
   *
   * Landing used to seed `selection`, which gives the right fade but also opens the verse
   * action menu: arriving from a note's scripture dock popped a highlight/note toolbar over
   * a verse nobody had chosen, and it stayed there with nothing to dismiss it. Arriving
   * somewhere is a place, not a gesture — only a gesture should offer actions.
   */
  const [landing, setLanding] = useState<[number, number] | null>(null);

  // A new chapter is a new document: keep no selection or roving focus from the
  // last one, or verse 12 of John 3 stays lit while reading John 4.
  useEffect(() => {
    setSelection(null);
    setLanding(null);
    setFocusedVerse(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [book, chapter, translation]);

  /**
   * Which verse is at the top of the view, for "where you left off".
   *
   * Written to a ref rather than state on purpose: this changes on every scroll frame, and
   * nothing on screen depends on it — only the reading log, which reads it when a session
   * ends. Putting it in state would re-render the whole chapter while scrolling it.
   *
   * The book and chapter ride along with the number. The effect that reports this runs on
   * chapter change, by which point the DOM already holds the NEXT chapter's verses, so a bare
   * number would be attributed to the chapter being left. The reader of this ref checks that
   * the address matches what it thinks it is reporting.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!visiblePositionRef || !container) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = container.getBoundingClientRect().top;
      // First verse whose bottom is still below the top edge — the one being read, rather
      // than the one that has just scrolled out of sight above it. Bails on the first hit, so
      // this stays cheap even in Psalm 119.
      for (const el of container.querySelectorAll<HTMLElement>('[data-reader-verse]')) {
        if (el.getBoundingClientRect().bottom > top) {
          const n = Number(el.dataset.readerVerse);
          if (Number.isFinite(n)) visiblePositionRef.current = { book, chapter, verse: n };
          return;
        }
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [book, chapter, verses, visiblePositionRef]);

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
    notes: { noteId: string; title: string; reference: string }[];
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
          reference: n.reference,
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

  /**
   * Tapping away puts things down — a pinned note card, or a verse selection and its menu.
   *
   * Both were sticky with no way out but undoing the exact gesture that made them: re-tapping
   * the same bar, or re-clicking the same verse. Anything you open by pointing at it should
   * close by pointing elsewhere.
   *
   * `pointerdown`, not `click`: a click fires after the press completes, which on a drag-select
   * across verses would arrive at whatever the pointer happened to be over on release. The
   * inside-test lists the surfaces that own these states, including the portaled popovers
   * (colour swatch, select menus) that live outside this component's DOM entirely — a plain
   * `contains()` check on the reader would treat those as outside and close the thing being
   * used.
   */
  useEffect(() => {
    if (!pinnedKey && !selection && !landing) return;
    const INSIDE = [
      '.pds-reader__verse',
      '.pds-reader-menu',
      '.pds-reader__bar',
      '.pds-reader__note-card',
      '.proto-shell__study-dock-layer',
      '.proto-inspector-desktop',
      '.proto-inspector-mobile-panel',
      '.dock-accent-swatch__popover',
      '.proto-select-menu__popover',
      '.proto-menu__popover',
    ].join(',');

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(INSIDE)) return;
      setPinnedKey(null);
      setActiveKey(null);
      setSelection(null);
      setLanding(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinnedKey(null);
      setActiveKey(null);
      setSelection(null);
      setLanding(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pinnedKey, selection, landing]);

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

  /*
   * Land on the deep-linked verse once its element exists — BEFORE the browser paints.
   *
   * This was a passive effect, which runs after paint, so the first frame showed the top of
   * the chapter and the second showed the verse. On its own that is a blink. Arriving out of
   * a scripture dock it is worse: the morph's clip opens onto that first frame, so the window
   * growing out of the dock card was filled with the wrong part of the chapter and then
   * snapped — the jarring cut in what is supposed to be one surface growing. A layout effect
   * puts the right verse under the clip from the very first frame.
   *
   * `scrollTop`, not `scrollIntoView`: the latter walks up and scrolls every scrollable
   * ancestor it finds, and inside the paper stack that includes layers that are mid-animation.
   */
  useLayoutEffect(() => {
    if (!focusVerse || verses.length === 0) return;
    const scroller = scrollRef.current;
    const el = scroller?.querySelector<HTMLElement>(`[data-reader-verse="${focusVerse}"]`);
    if (!scroller || !el) return;
    // Measured as a delta between two rects in the same space, rather than from `offsetTop`:
    // the verse's offset parent is the column, not the scroller, so an offset chain would
    // have to be walked and would still break the first time something between them gained
    // a `position`.
    const elRect = el.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const centreOffset = (scroller.clientHeight - elRect.height) / 2;
    scroller.scrollTop = Math.max(0, scroller.scrollTop + (elRect.top - scrollerRect.top) - centreOffset);
    /*
     * The whole passage, not just its first verse. Scrolling still targets `focusVerse` —
     * a range starts where it starts — but the focus that dims the rest of the chapter runs
     * to `focusVerseEnd`, so opening "John 3:16-18" leaves all three lit rather than lighting
     * 16 and dimming the two verses that were the reason for the link.
     *
     * Focus only: no `setSelection` here. Landing says "here is the passage", and arming the
     * action toolbar over verses nobody has touched yet would answer a question that has not
     * been asked.
     */
    const end = focusVerseEnd && focusVerseEnd > focusVerse ? focusVerseEnd : focusVerse;
    setLanding([focusVerse, end]);
    setFocusedVerse(focusVerse);
    // `landRequestKey` so asking for the verse you are already on lands on it again: the
    // verse number has not changed, but the request is new.
  }, [focusVerse, focusVerseEnd, verses.length, landRequestKey]);

  /*
   * Tapping a second verse extends the passage rather than replacing it — see
   * `nextVerseSelection` for the rule and why shift-only was not enough.
   */
  const selectVerse = useCallback((num: number, extend: boolean) => {
    setSelection((current) => nextVerseSelection(current, num, extend));
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

  /*
   * Verse handlers, above the loading and error returns below.
   *
   * They belong to `VerseSpan`, which is rendered far further down — but a hook after an
   * early return is a hook that does not run on the render that took it, and React counts.
   * Each takes the verse number so one stable callback serves every verse, which is what
   * lets the memo on `VerseSpan` actually hold.
   */
  const handleVerseFocus = useCallback((n: number) => setFocusedVerse(n), []);

  const handleVerseActivate = useCallback(
    (n: number, e: ReactMouseEvent<HTMLSpanElement>) => {
      // A dotted word is its own target: tapping it asks "who/what is this?", which is a
      // different question from "I want to act on this verse". Selecting the verse as well
      // would answer both at once and open the format bar over the dock.
      const suggestion = (e.target as HTMLElement | null)?.closest?.('.reference-suggestion');
      if (suggestion instanceof HTMLElement) {
        e.preventDefault();
        e.stopPropagation();
        const query = suggestion.dataset.referenceWord || suggestion.textContent?.trim() || '';
        if (query) {
          const anchor = `${book} ${chapter}:${n}`;
          setDock({
            kind: 'reference',
            query,
            anchor,
            verse: n,
            savedReferenceId: lookupSavedReferenceId(anchor, query),
          });
        }
        return;
      }
      selectVerse(n, e.shiftKey);
    },
    [book, chapter, selectVerse, lookupSavedReferenceId],
  );

  const handleVerseKeys = useCallback(
    (n: number, e: ReactKeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectVerse(n, e.shiftKey);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(n, 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(n, -1);
      }
    },
    [selectVerse, moveFocus],
  );


  if (isLoading) {
    // Below the grace threshold the reader shows nothing rather than a line that would be
    // gone before it could be read — a 40ms "Loading…" is a flicker, not information.
    if (!showLoading) return <div className="pds-reader" aria-busy="true" />;
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

  const selectionLabel =
    selection == null
      ? null
      : selection[0] === selection[1]
        ? `${data.book} ${data.chapter}:${selection[0]}`
        : `${data.book} ${data.chapter}:${selection[0]}-${selection[1]}`;

  /**
   * The verses currently under consideration — whatever put them there.
   *
   * A note card and a verse selection are the same situation from the reader's point of view:
   * a passage has been singled out and the rest of the chapter is context. Treating them as
   * one range means the fade is one behaviour rather than two that could drift apart, and a
   * card opened over an existing selection does not fight it for which verses matter.
   */
  const focusRange: [number, number] | null = activeBar
    ? [activeBar.startVerse, activeBar.endVerse]
    : (selection ?? landing);

  /** Text of the selected verses — what a highlight is *of*, for the dock's excerpt. */
  const selectedText =
    selection == null
      ? ''
      : verses
          .filter((v) => v.number >= selection[0] && v.number <= selection[1])
          .map((v) => v.text)
          .join(' ');

  /**
   * Whatever is already on the selection. Its presence is what turns Highlight and Annotate
   * from "make a new one" into "go back to the one that's here": a highlight and its
   * annotation are the same underlying row, so one lookup covers both buttons.
   *
   * Every verse in the range has to be the same row, not just the first. Keying off
   * `selection[0]` was a fair approximation while ranges took a shift-click and were rare;
   * now that two taps make one, selecting 16-20 across a highlight that only covers 20 would
   * silently reopen verse 20's annotation instead of offering a new highlight over all five.
   */
  const existingHighlight = (() => {
    if (!selection || !highlights) return undefined;
    const first = highlights.get(selection[0]);
    if (!first) return undefined;
    for (let v = selection[0] + 1; v <= selection[1]; v += 1) {
      // The map holds a fresh object per verse, so compare the row id rather than identity.
      if (highlights.get(v)?.studyThreadEntryId !== first.studyThreadEntryId) return undefined;
    }
    return first;
  })();
  /**
   * The id above, but only once it is real. Right after a fresh Highlight tap the cache holds
   * an optimistic row (see `useCreateChapterHighlight`) so the verse paints immediately — its
   * id isn't one the server knows yet, so Annotate can't PATCH a note onto it or skip its own
   * create call for it the way it does for a genuinely existing row.
   */
  const existingAnnotationId =
    existingHighlight?.studyThreadEntryId &&
    !isOptimisticChapterHighlightId(existingHighlight.studyThreadEntryId)
      ? existingHighlight.studyThreadEntryId
      : null;

  /** One action in the floating menu. */
  const MenuAction = ({
    icon,
    label,
    dot,
    onClick,
  }: {
    icon: ComponentProps<typeof Icon>['name'];
    label: string;
    /** Native parity with the share-link dot: this action already has something to go back to. */
    dot?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      className="pds-native-selection-bar__btn"
      title={`${dot ? `${label} (already done) — ` : ''}${label} ${selectionLabel ?? ''}`.trim()}
      aria-label={`${dot ? `${label}, already done. ` : ''}${label} ${selectionLabel ?? ''}`.trim()}
      onClick={onClick}
    >
      <Icon name={icon} size={16} aria-hidden />
      {dot ? <span className="pds-native-selection-bar__btn-dot" aria-hidden /> : null}
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
                      onHighlight({ start: selection[0], end: selection[1] }, token, selectedText);
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
                    if (existingHighlight) {
                      // Already highlighted — open on its own colour rather than firing the
                      // bar's last-picked one at it, which would silently recolour a highlight
                      // nobody asked to change. The swatches below already show the true colour
                      // selected; committing only happens if one of them is actually tapped.
                      setAccent(existingHighlight.accent);
                      setPaletteOpen(true);
                      return;
                    }
                    // Highlight first, ask about colour second. A bare swatch sitting in the
                    // menu was a colour with no stated purpose — it read as decoration until
                    // you guessed what it did. Committing on the first tap means the palette
                    // only ever appears attached to a highlight that already exists, so each
                    // colour is a change you can see rather than a choice you must predict.
                    onHighlight({ start: selection[0], end: selection[1] }, accent, selectedText);
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
                  dot={!!existingAnnotationId}
                  onClick={() => {
                    if (existingAnnotationId) {
                      // Already annotated — go straight to the existing row instead of
                      // starting another network round trip for one that's already there.
                      setDock({
                        kind: 'highlight',
                        reference: selectionLabel,
                        excerpt: selectedText,
                        accent: existingHighlight!.accent,
                        studyThreadEntryId: existingAnnotationId,
                        miniNoteBody: existingHighlight!.miniNoteBody ?? '',
                      });
                      setLanding(selection);
                      setSelection(null);
                      return;
                    }
                    // Open on the id-less state right away — the id arrives after the network
                    // round trip, and HighlightDockWeb already knows how to hold onto whatever
                    // gets typed before then and flush it once `studyThreadEntryId` shows up.
                    setDock({
                      kind: 'highlight',
                      reference: selectionLabel,
                      excerpt: selectedText,
                      accent,
                      studyThreadEntryId: null,
                      miniNoteBody: '',
                    });
                    void Promise.resolve(
                      onAnnotate({ start: selection[0], end: selection[1] }, accent, selectedText),
                    ).then((id) => {
                      if (!id) return;
                      setDock((prev) =>
                        prev && prev.kind === 'highlight' && prev.reference === selectionLabel
                          ? { ...prev, studyThreadEntryId: id }
                          : prev,
                      );
                    });
                    // Same as Passages: the dock now owns this passage, so keep it in focus
                    // without the toolbar left floating over the note field underneath it.
                    setLanding(selection);
                    setSelection(null);
                  }}
                />
                <Divider />
              </>
            ) : null}

            <MenuAction
              icon="shuffle"
              label="Passages"
              onClick={() => {
                setDock({ kind: 'passage', reference: selectionLabel });
                // The dock now shows what the selection was for — keep the passage in focus
                // (the fade on the rest of the chapter) without the toolbar sitting over it.
                setLanding(selection);
                setSelection(null);
              }}
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
          {/*
            The title IS the navigator.

            It already says where you are, so making it also the way to move costs no extra
            chrome on a surface whose whole point is that chrome recedes — and it puts jumping
            books where a reader looks to check what they are reading. Prev/next at the foot
            stays for continuing; this is for going somewhere.
          */}
          <div className="pds-reader__chapter-heading">
            <h1 className="pds-reader-chapter-title pds-reader__chapter-picker">
              {onNavigateTo ? (
                <>
                  <ProtoSelectMenu
                    label="Book"
                    value={data.book}
                    options={bookOptions}
                    className="pds-reader__picker-trigger"
                    groupsAsTabs
                    menuClassName="pds-reader__book-menu"
                    menuWidth={292}
                    // A book you have just chosen has no meaningful chapter yet, so start at
                    // its first rather than keeping a number that belonged to another book.
                    onChange={(nextBook) => onNavigateTo(nextBook, 1)}
                  />
                  <ProtoSelectMenu
                    label="Chapter"
                    value={data.chapter}
                    options={chapterOptions}
                    className="pds-reader__picker-trigger"
                    // A grid, not a list: Exodus has 40 chapters and Psalms 150, and a single
                    // column of numbers makes you scroll past most of the book to reach them.
                    menuClassName="pds-reader__chapter-menu"
                    menuWidth={232}
                    onChange={(nextChapter) => onNavigateTo(data.book, nextChapter)}
                  />
                </>
              ) : (
                `${data.book} ${data.chapter}`
              )}
            </h1>
            {/* The same chip the scripture dock puts the translation in — one fact, one
                shape, wherever it is stated. It was a bare caption here, which read as a
                stray line of grey text under the title rather than as the label it is. */}
            <p className="pds-reader__chapter-meta">
              <span
                className="scripture-pill-chrome__trans-chip"
                aria-label={`Translation ${data.translation}`}
              >
                {data.translation}
              </span>
            </p>
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
              // Not enough room above the card for the chrome to float clear of the words —
              // flip it below instead of letting it cover the chapter heading or a verse.
              data-chrome-placement={
                activeBar.top - CARD_BLEED < CHROME_CLEARANCE ? 'below' : undefined
              }
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
                    aria-label={`Open your note ${note.title}, which cites ${note.reference}`}
                    // The note's own reference, not the bar's: several notes can share a bar
                    // by having spans that collapse to the same verse range while citing that
                    // range differently, and only this note's own reference matches a pill in
                    // its document — see AnchorNote.reference in usePrototypeChapterNotes.ts.
                    onClick={() => onOpenNoteAtReference?.(note.noteId, note.reference)}
                    // Belt-and-suspenders on top of the bar-level prefetch below: keyboard
                    // focus reaches a row without ever hovering the bar, and pointer-down
                    // fires a beat before click, so the fetch has a head start either way.
                    onPointerDown={() => onPrefetchNote?.(note.noteId)}
                    onFocus={() => onPrefetchNote?.(note.noteId)}
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
                  // Warm every note this bar can open before the card even finishes
                  // fading in — cheap (react-query dedupes) and the card offers no
                  // narrower signal yet of which one will be tapped.
                  bar.notes.forEach((n) => onPrefetchNote?.(n.noteId));
                }}
                onMouseLeave={() => {
                  if (!pinnedKey) setActiveKey(null);
                }}
                onClick={() => {
                  // Tap pins; tapping the pinned bar again lets it go.
                  const next = pinnedKey === bar.key ? null : bar.key;
                  setPinnedKey(next);
                  setActiveKey(next);
                  if (next) bar.notes.forEach((n) => onPrefetchNote?.(n.noteId));
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
            data-focus={focusRange ? 'true' : undefined}
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
                      <VerseSpan
                        verse={verse}
                        selected={
                          selection != null &&
                          verse.number >= selection[0] &&
                          verse.number <= selection[1]
                        }
                        accent={highlights?.get(verse.number)?.accent}
                        inFocus={
                          focusRange != null &&
                          verse.number >= focusRange[0] &&
                          verse.number <= focusRange[1]
                        }
                        roving={rovingVerse === verse.number}
                        html={verseHtml.get(verse.number) ?? EMPTY_VERSE_HTML}
                        onFocusVerse={handleVerseFocus}
                        onActivate={handleVerseActivate}
                        onKeys={handleVerseKeys}
                      />
                    </Fragment>
                  ))}
                </p>
              </div>
            ) : (
              verses.map((verse) => (
                <div className="pds-reader__block" role="none" key={verse.number}>
                  <p className="pds-reader-text" role="none">
                    <VerseSpan
                      verse={verse}
                      selected={
                        selection != null &&
                        verse.number >= selection[0] &&
                        verse.number <= selection[1]
                      }
                      accent={highlights?.get(verse.number)?.accent}
                      inFocus={
                        focusRange != null &&
                        verse.number >= focusRange[0] &&
                        verse.number <= focusRange[1]
                      }
                      roving={rovingVerse === verse.number}
                      html={verseHtml.get(verse.number) ?? EMPTY_VERSE_HTML}
                      onFocusVerse={handleVerseFocus}
                      onActivate={handleVerseActivate}
                      onKeys={handleVerseKeys}
                    />
                  </p>
                </div>
              ))
            )}
          </div>

          {/* Where reading continues. Both ends cross book boundaries, so Exodus 40 offers
              Leviticus 1 rather than nothing — the canon reads as one book here, and only
              Genesis 1 and the end of Revelation have no neighbour. */}
          {onNavigateTo ? (
            <nav className="pds-reader__chapter-nav" aria-label="Chapter navigation">
              {prevChapter ? (
                <button
                  type="button"
                  className="pds-reader__chapter-nav-btn"
                  onClick={() => onNavigateTo(prevChapter.book, prevChapter.chapter)}
                >
                  <Icon name="caret-left" size={12} aria-hidden />
                  <span>
                    {prevChapter.book} {prevChapter.chapter}
                  </span>
                </button>
              ) : (
                <span />
              )}
              {nextChapter ? (
                <button
                  type="button"
                  className="pds-reader__chapter-nav-btn pds-reader__chapter-nav-btn--next"
                  onClick={() => onNavigateTo(nextChapter.book, nextChapter.chapter)}
                >
                  <span>
                    {nextChapter.book} {nextChapter.chapter}
                  </span>
                  <Icon name="caret-right" size={12} aria-hidden />
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
              <ReferenceDockWeb
                initialQuery={dock.query}
                onDone={() => setDock(null)}
                // Pending only when this exact word hasn't already been saved against this
                // exact passage — `savedReferenceId` is looked up before the dock even opens
                // (see `lookupSavedReferenceId`), so a word saved on an earlier visit shows
                // its saved chrome immediately instead of the Save button all over again.
                pendingSuggestion={!dock.savedReferenceId && !!onSaveReference}
                // Drives the header's accent colour: without this a saved word's dock looked
                // exactly as neutral as one that was never saved at all, the same "nothing
                // visibly changed" gap the save button itself had.
                passageReferenceSaved={!!dock.savedReferenceId}
                saveReferenceLabel={saveReferenceLabel}
                onSaveReference={
                  onSaveReference
                    ? () => {
                        // Wait for the result: closing unconditionally made a save that
                        // silently failed (offline, space not ready yet) look identical to
                        // one that worked — the dock vanished either way. `false` keeps it
                        // open so there's something to retry against.
                        void Promise.resolve(
                          onSaveReference({
                            word: dock.query,
                            reference: dock.anchor,
                            verse: dock.verse,
                          }),
                        ).then((ok) => {
                          if (ok !== false) setDock(null);
                        });
                      }
                    : undefined
                }
                onOpenScripturePassage={(ref) => onOpenDock?.(ref)}
              />
            ) : dock.kind === 'passage' ? (
              <ScripturePillChromeWeb
                reference={dock.reference}
                translation={translation}
                // No pill to write back to: the passage is already the document behind this
                // dock, so editing the reference here would mean editing what you are reading.
                readOnly
                // "Passages" is the shuffle icon precisely because this dock is for cross-
                // references — opening on the plain verse text would make the button's own
                // promise a second tap away.
                initialShowCrossRefs
                editorChromeMode="prototypeNative"
                onDone={() => setDock(null)}
                onApply={() => undefined}
                onOpenPassageReference={(word) =>
                  setDock({
                    kind: 'reference',
                    query: word,
                    anchor: dock.reference,
                    savedReferenceId: lookupSavedReferenceId(dock.reference, word),
                  })
                }
                onOpenScripturePassage={(ref) => onOpenDock?.(ref)}
              />
            ) : (
              <HighlightDockWeb
                accent={dock.accent}
                excerpt={dock.excerpt}
                focusTitle={dock.reference}
                miniNoteBody={dock.miniNoteBody}
                entryKind="scriptureLink"
                studyThreadEntryId={dock.studyThreadEntryId}
                contextSpaceId={homeSpaceId}
                onAccentChange={(next) => {
                  setAccent(next);
                  // `selection` is already cleared by the time this dock is open (see the
                  // Annotate handlers above) — `focusRange` is what still names the verses it
                  // covers, whether they got here via a fresh selection or a reopened one.
                  if (focusRange) {
                    onHighlight?.({ start: focusRange[0], end: focusRange[1] }, next, dock.excerpt);
                  }
                  setDock({ ...dock, accent: next });
                }}
                onRemove={() => {
                  if (dock.studyThreadEntryId) onRemoveHighlight?.(dock.studyThreadEntryId);
                  setDock(null);
                }}
                onDone={() => setDock(null)}
              />
            ),
            studyDockCarouselHostEl,
          )
        : null}
    </div>
  );
}
