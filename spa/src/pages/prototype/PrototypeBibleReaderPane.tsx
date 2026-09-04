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
import {
  nextVerseSelection,
  type ReaderColumn,
  type VerseSelection,
} from './reader-verse-selection';
import { swipeDirection } from './reader-version-swipe';
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
  decoratePassageHtmlWithSavedHighlights,
  type PassageHighlightPaint,
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
import StudyDockCarouselWeb from '@/components/react/StudyDockCarouselWeb';
import {
  buildReadOnlyScriptureSession,
  closeDockEntry,
  emptyStudyDockStack,
  getActiveDockEntry,
  moveDockEntryToIndex,
  openOrFocusHighlight,
  openOrFocusReference,
  openOrFocusScripture,
  setActiveDockEntry,
  studyDockStackHasEntries,
  updateDockEntry,
  highlightDockStableKey,
  type HighlightDockSession,
  type StudyDockEntry,
  type StudyDockStack,
} from '@/utils/study-dock-stack';
import { useSettledFlag } from '../../hooks/useSettledFlag';
import PrototypeReaderChapterStack from './PrototypeReaderChapterStack';
import { TRANSLATION_ORDER, getTranslationAbbreviationDisplay } from '@/data/translations';
import { alignChapterVerses } from '@/utils/compare-chapter-alignment';

/**
 * Patch one highlight card's session in place, found by the key it was filed under.
 *
 * By key rather than by entry id because the id is generated inside `openOrFocusHighlight`
 * and reading it back out of a state updater is not something a pure updater can do. The key
 * is derived from the verses, which the caller knew before it opened anything.
 */
function updateHighlightSessionAt(
  stack: StudyDockStack,
  stableKey: string,
  patch: (session: HighlightDockSession) => HighlightDockSession,
): StudyDockStack {
  const entry = stack.entries.find((e) => e.stableKey === stableKey && e.kind === 'highlight');
  if (!entry) return stack;
  return updateDockEntry(stack, entry.id, (e) =>
    e.kind === 'highlight' ? { ...e, session: patch(e.session) } : e,
  );
}

/**
 * The verses of this chapter a dock card is about, or null when it is about something else.
 *
 * This is what makes the chapter's fade follow the active card. Each kind states its passage
 * in its own field, but they all state it the same way — "Book 3:16" or "Book 3:16-18" — so
 * one reader of the verse tail serves all three. Guarded on the book and chapter because a
 * cross-reference card can be pointing at another part of the Bible entirely, and the chapter
 * on screen should not fade to verses it does not contain.
 */
function dockEntryVerseRange(
  entry: StudyDockEntry | null,
  book: string,
  chapter: number,
): [number, number] | null {
  if (!entry) return null;
  const reference =
    entry.kind === 'scripture'
      ? entry.session.reference
      : entry.kind === 'highlight'
        ? entry.session.focusTitle
        : entry.kind === 'reference'
          ? entry.session.readerAnchor?.reference
          : null;
  if (!reference) return null;

  const [head, tail] = reference.split(':');
  if (!tail || head?.trim() !== `${book} ${chapter}`) return null;
  const [startRaw, endRaw] = tail.split('-');
  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start)) return null;
  const end = endRaw ? Number.parseInt(endRaw, 10) : start;
  return [start, Number.isFinite(end) && end >= start ? end : start];
}

/** Breathing room above and below the passage a note card holds up. */
/** Clearance between the selection and its action bar, either side of it. */
const READER_MENU_GAP = 8;
/**
 * The action bar's own height — `.pds-native-selection-bar` is a fixed 36px, so this is read
 * from the design rather than measured. Measuring would mean rendering it once at the wrong
 * place to find out where it goes.
 */
const READER_MENU_HEIGHT = 36;

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
  column,
  versionLabel,
  selected,
  accent,
  inFocus,
  roving,
  noteCount,
  html,
  onFocusVerse,
  onActivate,
  onKeys,
}: {
  verse: { number: number; text: string };
  /**
   * Which of the two texts this verse is in.
   *
   * Passed down and handed back to every handler rather than closed over, because the handlers
   * are one stable callback each for the whole chapter — which is what `memo` here depends on,
   * and what a per-column copy of them would quietly undo.
   */
  column: ReaderColumn;
  /**
   * The version this verse is in, spoken but not shown — only set while two are side by side.
   *
   * The two columns are one listbox, so a screen reader walks them as v1-ESV, v1-NIV, v2-ESV…
   * and without this every option is a bare verse with no way to tell which translation just
   * got read out. On screen the columns say it once at the top and do not need it repeated.
   */
  versionLabel?: string;
  selected: boolean;
  accent?: string;
  inFocus: boolean;
  roving: boolean;
  /** How many of your notes cite this verse, 0 for none. See `noteCountLabel` below. */
  noteCount: number;
  html: { __html: string };
  onFocusVerse: (n: number, column: ReaderColumn) => void;
  onActivate: (n: number, e: ReactMouseEvent<HTMLSpanElement>, column: ReaderColumn) => void;
  onKeys: (n: number, e: ReactKeyboardEvent<HTMLSpanElement>, column: ReaderColumn) => void;
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
      onFocus={() => onFocusVerse(verse.number, column)}
      onClick={(e) => onActivate(verse.number, e, column)}
      onKeyDown={(e) => onKeys(verse.number, e, column)}
    >
      <sup className="pds-reader-verse-num">{verse.number}</sup>
      <span className="pds-reader__verse-text" dangerouslySetInnerHTML={html} />
      {/*
        The margin's signal, for anyone not looking at it.

        The bars are `aria-hidden` and should stay that way — a screen reader walking a chapter
        should hear Scripture, not a list of marks interleaved between verses. But nothing else
        VOLUNTEERED the fact that you had written about a verse: the verse's own actions are
        Highlight / Annotate / Passages / Note, and the notes are reachable only by opening the
        passage dock, which you would have to already suspect was worth doing.

        So the verse says it itself. It is already a `role="option"` with an accessible name, and
        this rides inside that name — no pixels, no extra tab stop, nothing interleaved.
      */}
      {noteCount > 0 ? (
        <span className="proto-visually-hidden">{noteCountLabel(noteCount)}</span>
      ) : null}
      {versionLabel ? <span className="proto-visually-hidden">, {versionLabel}</span> : null}
    </span>
  );
});

/**
 * "in one of your notes" / "in 3 of your notes".
 *
 * Spelled out rather than a bare count, because it is read aloud in the middle of a verse and a
 * naked number there sounds like part of Scripture.
 */
function noteCountLabel(count: number): string {
  return count === 1 ? 'in one of your notes' : `in ${count} of your notes`;
}

const LOADING_GRACE_MS = 250;

/** Shared empty list, so an absent compare column does not make a new array every render. */
const EMPTY_VERSES: { number: number; text: string }[] = [];

/**
 * A signature of a column's sub-verse paints, so the markup memo re-runs when a span appears
 * or changes colour — and only then.
 *
 * A paints map is a fresh Map every render, so depending on it directly would rebuild every
 * verse's HTML on every render, which is exactly the bug the memo exists to prevent: a new
 * `{ __html }` object makes React re-apply innerHTML, and re-applying innerHTML destroys any
 * text selection the reader is holding. A string signature is stable when the content is.
 *
 * Whole-verse highlights are deliberately not in it. They paint through a CSS attribute on the
 * verse span, so recolouring one must not regenerate any markup at all.
 */
function versePaintsSignature(paints?: ReadonlyMap<number, PassageHighlightPaint[]>): string {
  if (!paints || paints.size === 0) return '';
  const parts: string[] = [];
  for (const [verse, list] of [...paints.entries()].sort((a, b) => a[0] - b[0])) {
    for (const p of list) parts.push(`${verse}:${p.id}:${p.accentRaw}:${p.excerpt}`);
  }
  return parts.join('|');
}

/**
 * Decorated markup per verse, built once per chapter rather than per render.
 *
 * The `{ __html }` objects have to be stable: a fresh object each render makes React re-apply
 * innerHTML every time, which destroys any text selection the reader is holding — the same bug
 * that bit the note body. The callers memoize the whole map, which keeps them identity-stable.
 *
 * One function for both columns. It was inline in the pane while a chapter was one text; a
 * second copy for the comparison would be the place the two columns quietly stopped matching.
 * `providers` is null until the dictionary index has loaded, which is what "no suggestions yet"
 * means — passing an empty array instead would run the decorator for nothing.
 */
function buildVerseHtml(
  verses: readonly { number: number; text: string }[],
  providers: ReferenceProvider[] | null,
  paints?: ReadonlyMap<number, PassageHighlightPaint[]>,
): Map<number, { __html: string }> {
  const map = new Map<number, { __html: string }>();
  for (const verse of verses) {
    const escaped = escapeHtml(verse.text);
    const decorated = providers
      ? decoratePassageHtmlWithReferenceSuggestions(escaped, providers)
      : escaped;
    /*
     * Marks go on after the dictionary suggestions, matching the order the scripture dock uses
     * — the painter splits text nodes, and running it last means it can split a suggestion span
     * rather than a suggestion decorator having to reason about marks that already exist.
     */
    const versePaints = paints?.get(verse.number);
    map.set(verse.number, {
      __html:
        versePaints && versePaints.length > 0
          ? decoratePassageHtmlWithSavedHighlights(decorated, [...versePaints])
          : decorated,
    });
  }
  return map;
}

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
   * Choose the translation to read in — from the stack's edges or the heading chip.
   *
   * Optional for the same reason `onNavigateTo` is: the paper-stack base renders this pane as
   * scenery, and a surface that is scenery should not offer to change what it is.
   */
  onChangeTranslation?: (translation: string) => void;
  /**
   * The chapter in the translation being compared against, when the page is split.
   *
   * The pane does not fetch it — same rule as `highlights`: it paints what it is given, which is
   * what keeps the two columns one surface rather than two readers side by side.
   */
  compare?: {
    translation: string;
    verses: { number: number; text: string }[];
    /**
     * This version's own highlights and sub-verse paints.
     *
     * Not shared with the primary column's, and not derivable from them: a highlight is stored
     * against the translation it was made in (`scripturePassageTranslation` in the query the
     * reader's highlights come from), because it is of a text rather than of a verse number.
     * Painting the primary's colours onto this column would claim you had marked words you
     * have never seen.
     */
    highlights?: ReadonlyMap<number, ReaderVerseHighlight>;
    versePaints?: ReadonlyMap<number, PassageHighlightPaint[]>;
  } | null;
  /** Open, change (`id`) or close (`null`) the second column. */
  onChangeCompare?: (translation: string | null) => void;
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
   * Sub-verse highlights, keyed by the verse they sit in — drawn as marks inside the text rather
   * than as a colour on the whole verse. Separate from `highlights` because they are a different
   * mechanism, not a different value: see `versePaints` in PrototypeReadPage.
   */
  versePaints?: ReadonlyMap<number, PassageHighlightPaint[]>;
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
    /** The full text of the verses in `range` — how the caller tells a phrase from a passage. */
    passageText?: string,
    /**
     * Which translation the excerpt is in, when it is not the one the page is reading.
     *
     * Only ever set from the comparison's second column. Absent means the page's own
     * translation, which is what every caller assumed silently before there were two.
     */
    translation?: string,
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
    /** As `onHighlight`'s: set only from the comparison's second column. */
    translation?: string,
  ) => Promise<string | null> | void;
  /**
   * Delete the row behind an open highlight dock — the "Remove highlight" trash icon.
   *
   * Takes the translation for the same reason the writes do: the row lives in one version's
   * set, and the cache the delete has to invalidate is keyed by it.
   */
  onRemoveHighlight?: (studyThreadEntryId: string, translation?: string) => void;
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
  onChangeTranslation,
  compare,
  onChangeCompare,
  onStartNote,
  onOpenDock,
  fontOverride,
  highlights,
  versePaints,
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
  const { studyDockCarouselHostEl, paperStack } = useProtoShell();


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
  /*
    All eleven, in canon order — the reader's whole set, not the two the stack peeks. Labels go
    through `getTranslationAbbreviationDisplay` because one of them is not its own id: NASB
    shows as "NASB 1995", and a menu that said "NASB" beside a chip that said "NASB 1995" would
    be two names for one translation.
  */
  const translationOptions = useMemo(
    () =>
      TRANSLATION_ORDER.map((id) => ({
        value: id,
        label: getTranslationAbbreviationDisplay(id),
        triggerLabel: getTranslationAbbreviationDisplay(id),
      })),
    [],
  );

  /*
    What `+` opens with: the first version in canon order that is not the one being read. A
    choice has to be made — an empty second column would be a split page asking a question —
    and the chip beside it changes it in one press.
  */
  /* One list of rows for the two columns, so neither can be laid out against the other's
     indices. Empty when there is no comparison, which costs nothing to compute. */
  const comparedRows = useMemo(
    () => (compare ? alignChapterVerses(verses, compare.verses) : []),
    [compare, verses],
  );

  const defaultCompareTranslation = useMemo(
    () => TRANSLATION_ORDER.find((id) => id !== data?.translation) ?? TRANSLATION_ORDER[0],
    [data?.translation],
  );

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

  /* One signature per column — see `versePaintsSignature` for why the maps cannot be depended
     on directly, and `buildVerseHtml` for what the memos below actually do. */
  const versePaintSignature = useMemo(() => versePaintsSignature(versePaints), [versePaints]);
  const comparePaintSignature = useMemo(
    () => versePaintsSignature(compare?.versePaints),
    [compare?.versePaints],
  );

  const verseHtml = useMemo(
    () => buildVerseHtml(verses, eastonsIndex ? referenceProviders : null, versePaints),
    // versePaintSignature stands in for versePaints — see its own comment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [verses, eastonsIndex, referenceProviders, versePaintSignature],
  );

  /*
   * The same treatment for the version being compared against, and for the same reasons.
   *
   * Built here rather than left as plain text because the second column is a column, not a
   * quotation: the dictionary underlines a word wherever it is read, and a sub-verse highlight
   * made in this version has to paint in the text it was made in. A separate memo rather than
   * one over both, so a change on one side does not regenerate the other's markup and tear out
   * a live text selection in it.
   */
  const compareVerseHtml = useMemo(
    () =>
      buildVerseHtml(
        compare?.verses ?? EMPTY_VERSES,
        eastonsIndex ? referenceProviders : null,
        compare?.versePaints,
      ),
    // comparePaintSignature stands in for compare.versePaints — see `versePaintsSignature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compare?.verses, eastonsIndex, referenceProviders, comparePaintSignature],
  );

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

  /**
   * What the reader has open in the shell's study dock — the same stack a note keeps.
   *
   * This used to be a single card. Not by decision: the reader portalled one dock straight
   * into the shell slot and skipped the carousel, so there was nowhere for a second one to go,
   * and opening a cross-reference silently replaced the passage you opened it from. The
   * carousel was always the thing that holds several and centres the active one over the
   * paper; using it is what makes "keep this open while I look at that" possible here too.
   *
   * Not persisted, unlike a note's stack: a note's docks are part of a document you return to,
   * while these belong to a passage you are passing through.
   */
  const [dockStack, setDockStack] = useState<StudyDockStack>(emptyStudyDockStack());

  /** A word looked up while reading — keyed by where it was read, so the same word at two
      verses is two cards rather than one that quietly changes what it would save. */
  const openReferenceDock = useCallback(
    (input: { query: string; anchor: string; verse?: number; savedReferenceId?: string | null }) => {
      setDockStack((s) =>
        openOrFocusReference(s, {
          query: input.query,
          readerAnchor: {
            reference: input.anchor,
            verse: input.verse,
            savedReferenceId: input.savedReferenceId ?? null,
          },
        }),
      );
    },
    [],
  );

  /** A passage opened for reading beside the chapter — no pill behind it to write back to. */
  const openPassageDock = useCallback(
    (reference: string) => {
      setDockStack((s) =>
        openOrFocusScripture(s, buildReadOnlyScriptureSession(reference, translation, null)),
      );
    },
    [translation],
  );

  /**
   * A highlight's own card, keyed by the verses it covers rather than by its row id.
   *
   * The id is not there yet when the card opens — it arrives from the network a moment later —
   * so keying on it would file the card under one name and then look for it under another.
   * The verse range is known at the tap and never changes, which also means annotating the
   * same verses twice focuses the card that is already up.
   */
  const openHighlightDock = useCallback(
    (range: [number, number], session: Omit<HighlightDockSession, 'range' | 'studyThreadEntryId'>,
     studyThreadEntryId: string | null) => {
      // The same key `openOrFocusHighlight` will compute from this session — including its
      // translation, or the id would be written into an entry filed under a different name.
      const key = highlightDockStableKey(
        null,
        { from: range[0], to: range[1] },
        session.scripturePassageTranslation,
      );
      setDockStack((s) =>
        openOrFocusHighlight(s, {
          ...session,
          studyThreadEntryId: null,
          range: { from: range[0], to: range[1] },
        }),
      );
      if (studyThreadEntryId) {
        setDockStack((s) => updateHighlightSessionAt(s, key, (sess) => ({ ...sess, studyThreadEntryId })));
      }
    },
    [],
  );

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
    openReferenceDock({
      query: referenceRequest.word,
      anchor: referenceRequest.anchor,
      verse: referenceRequest.verse,
      savedReferenceId: lookupSavedReferenceId(referenceRequest.anchor, referenceRequest.word),
    });
  }, [referenceRequest, lookupSavedReferenceId, openReferenceDock]);
  /** The menu is showing colours for the highlight just made, rather than the action list. */
  const [paletteOpen, setPaletteOpen] = useState(false);

  /**
   * The selected verses: a range, because selection can extend, in one of the two columns.
   *
   * The column is part of the selection rather than beside it so the two cannot disagree.
   * Everything downstream — the text a highlight is of, the version it is written against,
   * which verse the action bar hangs under — is a question about one column, and a `[start,
   * end]` that did not say which one would answer all three for whichever column asked last.
   */
  const [selection, setSelection] = useState<VerseSelection>(null);

  /**
   * A drag across words, as opposed to a tap on a verse.
   *
   * Two gestures, two granularities, one storage model: tapping a verse marks a verse, dragging
   * across words marks a phrase. This holds the phrase; `selection` still holds the verse range
   * either way, so the focus fade, the toolbar's placement and every existing action keep working
   * without knowing which gesture produced them.
   *
   * Pointer-only by decision. The verse listbox stays the primary interaction and keyboard users
   * keep exactly the model they have — a keyboard route (shift+arrow within a verse) is deferred
   * rather than refused. See docs/future/READER_PARTIAL_VERSE_HIGHLIGHTS.md.
   */
  const [dragText, setDragText] = useState<string | null>(null);

  /**
   * Which of the two versions is on screen, for the width where only one can be.
   *
   * Below the pane width two columns can be read at, the comparison stops being side by side
   * and becomes one column you swap between — comparing by alternation instead of by glance,
   * which is what a phone has room for. This says which one; the CSS at that width hides the
   * other, and above it the value has no effect because both are shown.
   *
   * Presentation, deliberately: a swipe is a look, not a decision. It does not touch `?t=`,
   * `?c=`, or the account default, because holding two readings against each other means going
   * back and forth several times and every one of those must be free. Which version the *next*
   * chapter opens in is a question the chips answer, and they still do.
   */
  const [visibleColumn, setVisibleColumn] = useState<ReaderColumn>('primary');
  /** Where the roving tab stop is, and in which column — the keyboard's own cursor. */
  const [focusedVerse, setFocusedVerse] = useState<{ column: ReaderColumn; number: number } | null>(
    null,
  );

  /**
   * Where a deep link put you — dimmed-in like a selection, but not one.
   *
   * Landing used to seed `selection`, which gives the right fade but also opens the verse
   * action menu: arriving from a note's scripture dock popped a highlight/note toolbar over
   * a verse nobody had chosen, and it stayed there with nothing to dismiss it. Arriving
   * somewhere is a place, not a gesture — only a gesture should offer actions.
   */
  const [landing, setLanding] = useState<[number, number] | null>(null);

  /**
   * A new chapter is a new document: keep no selection or roving focus from the last one, or
   * verse 12 of John 3 stays lit while reading John 4.
   *
   * On a *change*, never on mount. On the first render there is no last document to carry
   * anything over from, and running it there raced the landing layout effect below: layout
   * effects run before passive ones, so arriving at a chapter already in the query cache set
   * the focus and centred the verse, and then this cleared both and scrolled back to the top.
   *
   * Invisible on a first visit, because the chapter is not cached yet — the landing effect
   * bails on `verses.length === 0`, this runs against nothing, and landing is set later when
   * the verses arrive. Which is exactly why it presented as "the highlight works the first
   * time, and not when I come back to it".
   */
  const lastDocumentKey = useRef<string | null>(null);
  useEffect(() => {
    // The compared version counts: a selection in the second column is of text that is gone
    // the moment that column changes translation, and acting on it would quote the old one.
    const documentKey = `${book}|${chapter}|${translation}|${compare?.translation ?? ''}`;
    // Also guards React's double-invoked mount effects in development, where the ref survives.
    if (lastDocumentKey.current === documentKey) return;
    const isFirstRender = lastDocumentKey.current === null;
    lastDocumentKey.current = documentKey;
    if (isFirstRender) return;
    setSelection(null);
    setLanding(null);
    setFocusedVerse(null);
    // Back to the version the page is in. A chapter opens in its own translation whatever you
    // had swapped to in the last one — the swap is about this passage, not a setting.
    setVisibleColumn('primary');
    scrollRef.current?.scrollTo({ top: 0 });
  }, [book, chapter, translation, compare?.translation]);

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
   * How many of your notes cite each verse — the margin's signal, in a form that can be spoken.
   *
   * Derived from `anchorLanes`, not from the measured `bars`: the bars only exist once layout has
   * settled, and an accessible name that appears a frame late is worse than one that is simply
   * right. `anchorLanes` is already gated on `showMarginNotes`, so turning margin notes off takes
   * the spoken cue with it — one switch, one meaning, which is the decision recorded in
   * docs/future/READER_MARGIN_INDICATORS.md.
   */
  const noteCountByVerse = useMemo(() => {
    const counts = new Map<number, number>();
    for (const lane of anchorLanes) {
      // Every verse the anchor covers, not just its first — a note on 3-5 is "in your notes" on
      // all three. `mergedCount` rather than `notes.length` so a bar standing for a folded note
      // still speaks for both, which is the whole reason the bar keeps its own span.
      for (let v = lane.startVerse; v <= lane.endVerse; v++) {
        counts.set(v, (counts.get(v) ?? 0) + lane.mergedCount);
      }
    }
    return counts;
  }, [anchorLanes]);

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
    /*
     * The verse as it is actually on screen — there can be two of it.
     *
     * A comparison renders every verse number twice, and on a phone one of the two is
     * `display: none`. A plain `querySelector` takes the first in the DOM, which is the primary
     * column's: right while both are showing, and silently wrong once someone swipes to the
     * other version, because a hidden element has no client rects and every bar would drop out.
     * Asking for the one with a rect is the same answer at every width without knowing which
     * width it is, and it lets the marks follow the swipe.
     */
    const renderedVerse = (n: number): HTMLElement | null => {
      for (const el of column.querySelectorAll<HTMLElement>(`[data-reader-verse="${n}"]`)) {
        if (el.getClientRects().length > 0) return el;
      }
      return null;
    };
    const measure = () => {
      const base = column.getBoundingClientRect().top;
      const next: MarginBar[] = [];
      for (const a of anchorLanes) {
        const startEl = renderedVerse(a.startVerse);
        const endEl = renderedVerse(a.endVerse);
        if (!startEl || !endEl) continue;
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
  }, [anchorLanes, verseLayout, verses, compare, visibleColumn]);

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
      setDragText(null);
      setLanding(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPinnedKey(null);
      setActiveKey(null);
      setSelection(null);
      setDragText(null);
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
   * Turn a native text selection inside the chapter into a verse range plus its text.
   *
   * `selectionchange` on the document rather than `mouseup` on the column: a drag can end
   * outside the column (past the last line, over the margin) and a `mouseup` listener there
   * would miss it, leaving a visible selection the toolbar never offered to act on.
   *
   * Collapsed selections are ignored — that is a click, and clicks are the verse-tap path, which
   * must keep working exactly as it does. A selection that touches no verse is ignored too:
   * dragging across the chapter heading is not a highlight of anything.
   */
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = document.getSelection();
      const column = columnRef.current;
      if (!sel || !column || sel.isCollapsed || sel.rangeCount === 0) {
        setDragText(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!column.contains(range.commonAncestorContainer)) {
        setDragText(null);
        return;
      }
      /*
       * Which column the drag is in — and a drag across both is not a drag in either.
       *
       * With two versions side by side, `sel.toString()` for a range that starts in one and
       * ends in the other is one translation's words run into another's. That is not a phrase
       * anybody meant to mark, and there is no version to write it against, so it is ignored
       * outright rather than resolved to whichever end the code happened to read first.
       */
      const columnOf = (node: Node | null) =>
        (node instanceof HTMLElement ? node : (node?.parentElement ?? null))?.closest<HTMLElement>(
          '[data-reader-column]',
        ) ?? null;
      const anchorColumn = columnOf(sel.anchorNode);
      if (!anchorColumn || anchorColumn !== columnOf(sel.focusNode)) {
        setDragText(null);
        return;
      }
      const side: ReaderColumn =
        anchorColumn.dataset.readerColumn === 'compare' ? 'compare' : 'primary';
      const text = sel.toString().trim();
      if (!text) {
        setDragText(null);
        return;
      }
      /* Which verses the drag touches. Taken from the DOM rather than from character offsets:
         the verse spans are the only thing that knows where one verse ends. Scoped to the
         column the drag is in, so the same numbers in the other version are not swept up. */
      const touched: number[] = [];
      for (const el of anchorColumn.querySelectorAll<HTMLElement>('[data-reader-verse]')) {
        if (!sel.containsNode(el, true)) continue;
        const n = Number(el.dataset.readerVerse);
        if (Number.isFinite(n)) touched.push(n);
      }
      if (touched.length === 0) {
        setDragText(null);
        return;
      }
      const start = Math.min(...touched);
      const end = Math.max(...touched);
      setDragText(text);
      setSelection((current) =>
        current && current.start === start && current.end === end && current.column === side
          ? current
          : { start, end, column: side },
      );
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => document.removeEventListener('selectionchange', onSelectionChange);
  }, []);

  /**
   * Where the floating menu sits — under the last selected verse, in viewport coordinates.
   *
   * Re-measured on scroll and resize because the menu is `position: fixed` (so it is never
   * clipped by the scroller) while its anchor moves with the text.
   */
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; above: boolean } | null>(
    null,
  );
  const selectionEnd = selection?.end ?? null;
  const selectionColumn = selection?.column ?? null;

  useEffect(() => {
    if (selectionEnd == null || selectionColumn == null) {
      setMenuPos(null);
      // A new selection starts at the action list; the palette belonged to the last highlight.
      setPaletteOpen(false);
      return;
    }
    const place = () => {
      // Column-qualified: with a comparison open the same verse number exists twice, and the
      // bar belongs under the one that was actually selected.
      const el = scrollRef.current?.querySelector(
        `[data-reader-column="${selectionColumn}"] [data-reader-verse="${selectionEnd}"]`,
      );
      if (!(el instanceof HTMLElement)) return;
      const rects = el.getClientRects();
      // Last rect, not the bounding box: a verse that wraps spans several lines, and the
      // menu belongs under the line the selection actually ends on.
      const rect = rects[rects.length - 1] ?? el.getBoundingClientRect();
      /*
       * Flip above the selection rather than sit over the dock band.
       *
       * Two portals share this screen and neither knew about the other: the toolbar goes to
       * `document.body`, the study-dock carousel to the shell's dock layer. A verse selected low
       * in the chapter with a card already open put the action capsule on top of the cards.
       *
       * Two things already softened it and neither is collision handling: Annotate and Passages
       * clear the selection when they open a card, so the toolbar often leaves of its own accord,
       * and the dock layer is in the outside-click allow-list, so touching a card does not dismiss
       * the selection. A selection low in the chapter over an already-open card still overlapped.
       *
       * Measured from the live dock layer rather than a constant: the band's height depends on
       * how many cards are open and whether the carousel is collapsed, so any number written here
       * would be wrong in most states.
       */
      const dockBand = document
        .querySelector('.proto-shell__study-dock-layer')
        ?.getBoundingClientRect();
      const dockTop = dockBand && dockBand.height > 0 ? dockBand.top : window.innerHeight;
      const below = rect.bottom + READER_MENU_GAP;
      const above = below + READER_MENU_HEIGHT > dockTop;
      setMenuPos({
        top: above ? rect.top - READER_MENU_GAP - READER_MENU_HEIGHT : below,
        left: rect.left + rect.width / 2,
        above,
      });
    };
    place();
    const scroller = scrollRef.current;
    scroller?.addEventListener('scroll', place, { passive: true });
    window.addEventListener('resize', place);
    return () => {
      scroller?.removeEventListener('scroll', place);
      window.removeEventListener('resize', place);
    };
  }, [selectionEnd, selectionColumn]);

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
    // Landing is always in the page's own translation — a deep link names a chapter and a
    // verse, never a column of a comparison the reader may or may not have open.
    setFocusedVerse({ column: 'primary', number: focusVerse });
    // `landRequestKey` so asking for the verse you are already on lands on it again: the
    // verse number has not changed, but the request is new.
  }, [focusVerse, focusVerseEnd, verses.length, landRequestKey]);

  /*
   * Tapping a second verse extends the passage rather than replacing it — see
   * `nextVerseSelection` for the rule and why shift-only was not enough.
   */
  /**
   * Show the other version.
   *
   * Clears the selection and the roving focus rather than carrying them across, and both for
   * the same reason: they belong to a piece of text that is no longer on screen. Carried over,
   * the action bar would hang under a verse that is now `display: none` — `place()` measures an
   * element with no client rects and leaves the bar where it last was, floating over words it
   * is not about. A swap is a page turn; a page turn puts the passage down.
   */
  const swapVisibleColumn = useCallback(() => {
    setVisibleColumn((c) => (c === 'primary' ? 'compare' : 'primary'));
    setSelection(null);
    setDragText(null);
    setFocusedVerse(null);
  }, []);

  /*
   * A drag across the chapter, on a touchscreen, where only one version fits.
   *
   * Three gates, each closing off something this must not become.
   *
   * Touch only. On a pointer, dragging across words is how a phrase is marked — the gesture
   * this would be stealing is the one the sub-verse highlight feature is made of.
   *
   * Only where the columns have actually stacked, asked of the layout rather than restated as
   * a number: `grid-template-columns` resolving to a single track *is* the CSS deciding there
   * is one column, so the breakpoint lives in one place and this cannot drift from it.
   *
   * And `swipeDirection` for the rest — see it for why horizontal distance alone is not enough.
   */
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const handleVersesPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' || !compare) return;
      swipeStart.current = { x: e.clientX, y: e.clientY };
    },
    [compare],
  );

  const handleVersesPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const start = swipeStart.current;
      swipeStart.current = null;
      if (!start || !compare) return;
      if (!swipeDirection(e.clientX - start.x, e.clientY - start.y)) return;
      const row = e.currentTarget.querySelector<HTMLElement>('.pds-reader__compare-row');
      if (!row) return;
      const stacked =
        getComputedStyle(row).gridTemplateColumns.trim().split(/\s+/).length === 1;
      if (!stacked) return;
      /* Either direction swaps, because there are two versions and no third: a swipe means
         "the other one", and making left and right mean different things would invent an
         order the pair does not have. */
      swapVisibleColumn();
    },
    [compare, swapVisibleColumn],
  );

  const selectVerse = useCallback((num: number, extend: boolean, column: ReaderColumn) => {
    setSelection((current) => nextVerseSelection(current, num, extend, column));
  }, []);

  /** One column's verses — the list the arrow keys walk and the text actions read. */
  const versesIn = useCallback(
    (column: ReaderColumn) => (column === 'compare' ? (compare?.verses ?? EMPTY_VERSES) : verses),
    [compare?.verses, verses],
  );

  /*
   * Scoped to this pane's scroller rather than the document.
   *
   * A verse number is not unique on the page: the paper stack renders a whole second reader as
   * its base, and now a comparison renders the same numbers twice within this one. A bare
   * `document.querySelector` would move focus into whichever matched first, which with a note
   * open over a chapter is a different reader entirely.
   */
  const focusVerseElement = useCallback((column: ReaderColumn, num: number) => {
    scrollRef.current
      ?.querySelector<HTMLElement>(
        `[data-reader-column="${column}"] [data-reader-verse="${num}"]`,
      )
      ?.focus();
  }, []);

  const moveFocus = useCallback(
    (from: number, delta: number, column: ReaderColumn) => {
      const list = versesIn(column);
      const i = list.findIndex((v) => v.number === from);
      if (i === -1) return;
      const next = list[Math.min(list.length - 1, Math.max(0, i + delta))];
      setFocusedVerse({ column, number: next.number });
      focusVerseElement(column, next.number);
    },
    [versesIn, focusVerseElement],
  );

  /**
   * Step sideways to the same verse in the other version.
   *
   * The rows are aligned by verse number, so "the same verse over there" is exactly what the
   * eye is doing when it crosses a parallel Bible — and without this the keyboard could reach
   * the second column only by tabbing through every verse of the first. Nothing happens where
   * the other version has no such verse: the row is a gap there, and moving focus into an
   * empty cell would be a tab stop on the words "Not in NIV".
   */
  const crossFocus = useCallback(
    (num: number, column: ReaderColumn) => {
      const other: ReaderColumn = column === 'primary' ? 'compare' : 'primary';
      if (!versesIn(other).some((v) => v.number === num)) return;
      setFocusedVerse({ column: other, number: num });
      focusVerseElement(other, num);
    },
    [versesIn, focusVerseElement],
  );

  /**
   * Which verse carries the tab stop, per column — exactly one across the whole listbox.
   *
   * With focus somewhere, that verse is it and the other column has none. With focus nowhere,
   * it is the first verse of the primary column, which is where a reader entering the chapter
   * should land whether or not a comparison is open.
   */
  const rovingVerse = (column: ReaderColumn): number | null => {
    if (focusedVerse) return focusedVerse.column === column ? focusedVerse.number : null;
    return column === 'primary' ? (verses[0]?.number ?? null) : null;
  };

  /*
   * Verse handlers, above the loading and error returns below.
   *
   * They belong to `VerseSpan`, which is rendered far further down — but a hook after an
   * early return is a hook that does not run on the render that took it, and React counts.
   * Each takes the verse number so one stable callback serves every verse, which is what
   * lets the memo on `VerseSpan` actually hold.
   */
  const handleVerseFocus = useCallback(
    (n: number, column: ReaderColumn) => setFocusedVerse({ column, number: n }),
    [],
  );

  const handleVerseActivate = useCallback(
    (n: number, e: ReactMouseEvent<HTMLSpanElement>, column: ReaderColumn) => {
      /*
       * The click that ends a drag is not a tap.
       *
       * A browser fires `click` after `mouseup` even when the pointer moved, so dragging across
       * a phrase inside ONE verse used to arrive here as a tap on that verse — and
       * `nextVerseSelection` reads a tap on the sole selected verse as "the way back out",
       * returning null. The drag selected [20,20], the trailing click cleared it, and the
       * toolbar never appeared. Highlighting part of a single verse is the whole point of the
       * feature, so this was the primary case failing while a cross-verse drag worked: clicking
       * verse 18 of [17,18] narrows to [18,18] rather than clearing, which left a selection
       * behind and made the bug look like it did not exist.
       *
       * Read from the live selection rather than tracked in a ref, so this stays one
       * self-contained condition and the callback keeps the stable identity that
       * `VerseSpan`'s memo depends on. A genuine tap always arrives with the selection already
       * collapsed — mousedown collapses it before click — so "there is still a selection" is
       * exactly the thing that distinguishes the two.
       *
       * Shift is let through: shift-click extends the verse range on purpose, and it drags the
       * DOM selection along with it, so the same test would suppress the one gesture whose
       * whole job is to extend.
       */
      if (!e.shiftKey) {
        const active = document.getSelection();
        const column = columnRef.current;
        if (
          active &&
          !active.isCollapsed &&
          active.rangeCount > 0 &&
          active.toString().trim() &&
          column?.contains(active.getRangeAt(0).commonAncestorContainer)
        ) {
          return;
        }
      }
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
          openReferenceDock({
            query,
            anchor,
            verse: n,
            savedReferenceId: lookupSavedReferenceId(anchor, query),
          });
        }
        return;
      }
      selectVerse(n, e.shiftKey, column);
    },
    [book, chapter, selectVerse, lookupSavedReferenceId],
  );

  const handleVerseKeys = useCallback(
    (n: number, e: ReactKeyboardEvent<HTMLSpanElement>, column: ReaderColumn) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        selectVerse(n, e.shiftKey, column);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveFocus(n, 1, column);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveFocus(n, -1, column);
      } else if (e.key === 'ArrowRight' && column === 'primary') {
        // Only outward, per side: the two columns are left and right on the page, so right
        // from the left one and left from the right one is the whole gesture.
        e.preventDefault();
        crossFocus(n, column);
      } else if (e.key === 'ArrowLeft' && column === 'compare') {
        e.preventDefault();
        crossFocus(n, column);
      }
    },
    [selectVerse, moveFocus, crossFocus],
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

  /**
   * The column the selection is in, and everything that follows from it.
   *
   * One derivation rather than a `selection.column === 'compare'` test at each of the six
   * places that need it. They are all asking the same question — *which text is this action
   * about* — and answering it once is what keeps the excerpt, the version it is written
   * against, and the highlights it is checked against from ever describing different columns.
   */
  const activeColumn: ReaderColumn = selection?.column ?? 'primary';
  const inCompare = activeColumn === 'compare' && !!compare;
  const activeVerses = inCompare ? compare.verses : verses;
  const activeHighlights = inCompare ? compare.highlights : highlights;
  const activeTranslation = inCompare ? compare.translation : data.translation;
  /**
   * Passed to the write handlers only from the second column.
   *
   * The page's own translation is what every caller assumed before there were two, so leaving
   * it absent there keeps the primary path exactly as it was rather than newly depending on an
   * argument being threaded correctly.
   */
  const actionTranslation = inCompare ? compare.translation : undefined;

  const selectionLabel =
    selection == null
      ? null
      : selection.start === selection.end
        ? `${data.book} ${data.chapter}:${selection.start}`
        : `${data.book} ${data.chapter}:${selection.start}-${selection.end}`;

  /**
   * The verses currently under consideration — whatever put them there.
   *
   * A note card and a verse selection are the same situation from the reader's point of view:
   * a passage has been singled out and the rest of the chapter is context. Treating them as
   * one range means the fade is one behaviour rather than two that could drift apart, and a
   * card opened over an existing selection does not fight it for which verses matter.
   *
   * With several dock cards up there is no longer one obvious answer, so the fade follows the
   * active one: bringing a card forward in the carousel re-focuses the chapter on its passage,
   * which turns the stack into a way of moving around the chapter rather than a pile in front
   * of it. A card about somewhere else entirely — a cross-reference into another book —
   * contributes nothing, and the chapter simply stays as it was.
   */
  const activeDockRange = dockEntryVerseRange(getActiveDockEntry(dockStack), data.book, data.chapter);
  /*
   * Verse numbers only — no column. The fade says which passage is under consideration, and
   * with two versions of it on screen the answer is both: dimming one column's context while
   * leaving the other's lit would break the alignment the comparison exists for.
   */
  const focusRange: [number, number] | null = activeBar
    ? [activeBar.startVerse, activeBar.endVerse]
    : selection
      ? [selection.start, selection.end]
      : (activeDockRange ?? landing);

  /**
   * The full text of the selected verses — the passage a highlight sits inside.
   *
   * From the selected column's own verses. Reading the primary's here while the selection was
   * in the second would file the other translation's words under this one's name, which is the
   * kind of wrong that looks right until someone reads the highlight back.
   */
  const passageText =
    selection == null
      ? ''
      : activeVerses
          .filter((v) => v.number >= selection.start && v.number <= selection.end)
          .map((v) => v.text)
          .join(' ');

  /**
   * What a highlight is *of* — the dragged phrase when there is one, the whole passage otherwise.
   *
   * A drag that happens to cover the whole passage collapses back to the passage on the way out
   * (`spanKeyForSelection` returns null for it), so the two gestures cannot produce two rows over
   * identical text.
   */
  const selectedText = dragText ?? passageText;

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
    if (!selection || !activeHighlights) return undefined;
    const first = activeHighlights.get(selection.start);
    if (!first) return undefined;
    for (let v = selection.start + 1; v <= selection.end; v += 1) {
      // The map holds a fresh object per verse, so compare the row id rather than identity.
      if (activeHighlights.get(v)?.studyThreadEntryId !== first.studyThreadEntryId) {
        return undefined;
      }
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
            /* Flipped bars grow from the edge nearest the selection, so the motion still reads as
               coming out of the text rather than falling toward it. */
            data-placement={menuPos.above ? 'above' : 'below'}
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
                      onHighlight(
                        { start: selection.start, end: selection.end },
                        token,
                        selectedText,
                        passageText,
                        actionTranslation,
                      );
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
                    onHighlight(
                      { start: selection.start, end: selection.end },
                      accent,
                      selectedText,
                      passageText,
                      actionTranslation,
                    );
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
                      openHighlightDock(
                        [selection.start, selection.end],
                        {
                          accent: existingHighlight!.accent,
                          excerpt: selectedText,
                          focusTitle: selectionLabel ?? undefined,
                          miniNoteBody: existingHighlight!.miniNoteBody ?? '',
                          entryKind: 'scriptureLink',
                          scripturePassageTranslation: activeTranslation,
                        },
                        existingAnnotationId,
                      );
                      setSelection(null);
      setDragText(null);
                      return;
                    }
                    // Open on the id-less state right away — the id arrives after the network
                    // round trip, and HighlightDockWeb already knows how to hold onto whatever
                    // gets typed before then and flush it once `studyThreadEntryId` shows up.
                    const annotated = selection;
                    openHighlightDock(
                      [annotated.start, annotated.end],
                      {
                        accent,
                        excerpt: selectedText,
                        focusTitle: selectionLabel ?? undefined,
                        miniNoteBody: '',
                        entryKind: 'scriptureLink',
                        // Which version this card is of. Its own field on the session, and the
                        // thing that keeps verse 5 of one translation from filing under verse 5
                        // of the other while neither has a row id yet.
                        scripturePassageTranslation: activeTranslation,
                      },
                      null,
                    );
                    void Promise.resolve(
                      onAnnotate(
                        { start: annotated.start, end: annotated.end },
                        accent,
                        selectedText,
                        actionTranslation,
                      ),
                    ).then((id) => {
                      if (!id) return;
                      const key = highlightDockStableKey(
                        null,
                        { from: annotated.start, to: annotated.end },
                        activeTranslation,
                      );
                      setDockStack((s) =>
                        updateHighlightSessionAt(s, key, (sess) => ({
                          ...sess,
                          studyThreadEntryId: id,
                        })),
                      );
                    });
                    // The card owns this passage now, so the toolbar steps out rather than
                    // floating over the note field underneath it.
                    setSelection(null);
      setDragText(null);
                  }}
                />
                <Divider />
              </>
            ) : null}

            <MenuAction
              icon="shuffle"
              label="Passages"
              onClick={() => {
                if (selectionLabel) openPassageDock(selectionLabel);
                // The card now shows what the selection was for, and the fade follows it from
                // there — so the toolbar steps out rather than sitting over the passage.
                setSelection(null);
      setDragText(null);
              }}
            />

            {onStartNote ? (
              <>
                <Divider />
                <MenuAction
                  icon="note-sticky"
                  label="Note"
                  onClick={() => onStartNote({ start: selection.start, end: selection.end })}
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
      <div
        className={`pds-reader__scroll${onChangeTranslation ? ' pds-reader-stack' : ''}${
          compare ? ' pds-reader-compare' : ''
        }`}
        ref={scrollRef}
      >
        {/*
          The pile, above the page it belongs to.

          Gated on `paperStack` as well as on the handler, and the extra test is the load-bearing
          one: a *parked* stack passes the live route as its base slot, handlers and all, so
          `onNavigateTo` alone covers one of the two stacked states and misses the other. What
          matters is being on a stack layer at all — sheet up, this pane is scenery at 96% with
          pointer events off; sheet parked, the stack's own edge row is pinned at the top of the
          pane and is the way back to the note. Either way a second pile in the same band is two
          stacks claiming one gesture.
        */}
        {onNavigateTo && data && !paperStack ? (
          <PrototypeReaderChapterStack
            book={data.book}
            chapter={data.chapter}
            translation={data.translation}
            onSelect={onNavigateTo}
          />
        ) : null}
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
            {/*
              The chip states the translation, and now changes it.

              It was a bare `<span>` — the one fact this heading named that it could not act on,
              which is the observation the date jump made about Activity's header: "a label that
              names exactly the thing you would want to change". The stack behind reaches the two
              you last read in; this reaches all eleven, the same division the day sheet draws
              between flipping an edge and jumping from the date.

              `ProtoSelectMenu`, not a hand-rolled popover, because this app has a settled answer
              for choosing one of a list and the study feed already recorded what happens without
              it: "a ninth hand-rolled variant is how those four drifted apart". The inspector's
              picker is the same component on the same options, and now the same handler.
            */}
            <div className="pds-reader__chapter-controls">
              {onChangeTranslation ? (
                <ProtoSelectMenu
                  value={data.translation}
                  options={translationOptions}
                  onChange={onChangeTranslation}
                  label="Translation"
                  /* Marked as the one on screen where only one is — see the narrow block in
                     prototype-components.css. Inert above that width, where both are. */
                  className={`pds-reader__trans-trigger scripture-pill-chrome__trans-chip${
                    visibleColumn === 'primary' ? ' pds-reader__trans-trigger--showing' : ''
                  }`}
                  menuClassName="pds-reader__trans-menu"
                  menuWidth={168}
                />
              ) : (
                <span
                  className="scripture-pill-chrome__trans-chip"
                  aria-label={`Translation ${data.translation}`}
                >
                  {getTranslationAbbreviationDisplay(data.translation)}
                </span>
              )}

              {/*
                The second column's chip, and the way to ask for one.

                Two chips rather than one control that means both: each names a column and picks
                that column's version, so which chip belongs to which side needs no explaining —
                they are in the same order as the columns. The `+` is the same chip shape with
                nothing in it yet, which is what makes the split feel like adding a version
                rather than entering a mode.

                Hidden below the width two columns can be read at, in CSS rather than here — the
                threshold belongs beside the layout it is about, in the same named container query
                the paper already measures itself with, and `useShellPaneIsWide` answers a
                different question (whether the inspector can dock). The column hides with it, so
                a narrowed pane degrades to the single column it can show while `?c=` waits in the
                URL for the room to come back. A swipe between versions is the real answer at that
                width, and its own pass.
              */}
              {onChangeCompare ? (
                compare ? (
                  <>
                    <ProtoSelectMenu
                      value={compare.translation}
                      options={translationOptions}
                      onChange={(next) => onChangeCompare(next)}
                      label="Compared translation"
                      className={`pds-reader__trans-trigger pds-reader__trans-trigger--compare scripture-pill-chrome__trans-chip${
                        visibleColumn === 'compare' ? ' pds-reader__trans-trigger--showing' : ''
                      }`}
                      menuClassName="pds-reader__trans-menu"
                      menuWidth={168}
                    />
                    {/*
                      The swipe, as a button.

                      A gesture nobody can see is a gesture only its author knows about, and a
                      swipe has no keyboard at all. Sitting between the two chips with one of
                      them marked, the glyph reads as "switch between these", which is why it
                      carries no text of its own — the versions are already named twice beside
                      it. Its label names the one it goes to, since that is what a screen reader
                      cannot get from the marking.

                      Only where one column shows, in CSS, beside the rule that stacks them.
                      Above that width both versions are already on screen and there is nothing
                      to swap to.
                    */}
                    <button
                      type="button"
                      className="pds-reader__compare-swap"
                      aria-label={`Read this chapter in ${getTranslationAbbreviationDisplay(
                        visibleColumn === 'primary' ? compare.translation : data.translation,
                      )}`}
                      onClick={swapVisibleColumn}
                    >
                      <Icon name="arrow-right-arrow-left" size={11} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="pds-reader__compare-close"
                      aria-label={`Stop comparing with ${getTranslationAbbreviationDisplay(compare.translation)}`}
                      onClick={() => onChangeCompare(null)}
                    >
                      <Icon name="xmark" size={11} aria-hidden />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="pds-reader__compare-add scripture-pill-chrome__trans-chip"
                    aria-label="Compare with another translation"
                    title="Compare with another translation"
                    onClick={() => onChangeCompare(defaultCompareTranslation)}
                  >
                    <Icon name="plus" size={10} aria-hidden />
                  </button>
                )
              ) : null}
            </div>
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
            /* Undivided, this whole listbox is the primary column — so the three DOM lookups
               that ask which column a verse is in have an answer either way, rather than one
               path scoped by column and another falling back to the first match on the page. */
            data-reader-column={compare ? undefined : 'primary'}
            /* Which version is on screen where only one fits. Read by the narrow block in
               prototype-components.css, which is the only thing this attribute means — at a
               width that shows both columns it is inert. */
            data-compare-visible={compare ? visibleColumn : undefined}
            onPointerDown={compare ? handleVersesPointerDown : undefined}
            onPointerUp={compare ? handleVersesPointerUp : undefined}
            /* A drag that leaves the element is not a swipe, and leaving `swipeStart` set would
               make the next unrelated pointer-up measure from wherever this one began. */
            onPointerCancel={() => { swipeStart.current = null; }}
            role="listbox"
            aria-label={`${data.book} ${data.chapter} verses`}
          >
            {compare ? (
              /*
                Two versions of the chapter, row by row.

                A row is a verse *number*, not an index — see `alignChapterVerses`. Translations
                disagree about how many verses a chapter has, and pairing by position would put
                verse 12 beside verse 11 from the first disagreement onward and stay wrong.
                A version that lacks a verse says so where its text would be, which is what a
                printed parallel Bible does and what stops an empty cell reading as still loading.

                Always one verse per row here, whatever `verseLayout` says. Prose is right when a
                chapter is being read — verses run together and the number is a locator inside the
                flow — and wrong when two texts are being held against each other, where the
                number is the whole point of the row.
              */
              comparedRows.map((row) => (
                <div className="pds-reader__compare-row" role="none" key={row.verse}>
                  {/*
                    `data-reader-column` is what makes a verse number unique again. It exists
                    twice on this page now, and three things ask the DOM which one they mean:
                    where the action bar hangs, where a drag happened, and where the arrow keys
                    move focus to.
                  */}
                  <p
                    className="pds-reader-text pds-reader__compare-cell"
                    role="none"
                    data-reader-column="primary"
                  >
                    {row.left == null ? (
                      <span className="pds-reader__compare-absent">
                        Not in {getTranslationAbbreviationDisplay(data.translation)}
                      </span>
                    ) : (
                      <VerseSpan
                        verse={{ number: row.verse, text: row.left }}
                        column="primary"
                        versionLabel={getTranslationAbbreviationDisplay(data.translation)}
                        selected={
                          selection != null &&
                          selection.column === 'primary' &&
                          row.verse >= selection.start &&
                          row.verse <= selection.end
                        }
                        accent={highlights?.get(row.verse)?.accent}
                        noteCount={noteCountByVerse.get(row.verse) ?? 0}
                        inFocus={
                          focusRange != null && row.verse >= focusRange[0] && row.verse <= focusRange[1]
                        }
                        roving={rovingVerse('primary') === row.verse}
                        html={verseHtml.get(row.verse) ?? EMPTY_VERSE_HTML}
                        onFocusVerse={handleVerseFocus}
                        onActivate={handleVerseActivate}
                        onKeys={handleVerseKeys}
                      />
                    )}
                  </p>
                  <p
                    className="pds-reader-text pds-reader__compare-cell pds-reader__compare-cell--second"
                    role="none"
                    data-reader-column="compare"
                  >
                    {row.right == null ? (
                      <span className="pds-reader__compare-absent">
                        Not in {getTranslationAbbreviationDisplay(compare.translation)}
                      </span>
                    ) : (
                      /*
                        The same component as the column beside it, on its own translation's
                        highlights and its own markup.
                        
                        It was a `<sup>` and a `<span>` — a quotation of the other column rather
                        than a column. Reading two versions is not reading one and glancing at
                        another: the verse you want to keep is as often the one on the right, and
                        a page where only half the words can be marked decides that for you.
                      */
                      <VerseSpan
                        verse={{ number: row.verse, text: row.right }}
                        column="compare"
                        versionLabel={getTranslationAbbreviationDisplay(compare.translation)}
                        selected={
                          selection != null &&
                          selection.column === 'compare' &&
                          row.verse >= selection.start &&
                          row.verse <= selection.end
                        }
                        accent={compare.highlights?.get(row.verse)?.accent}
                        noteCount={noteCountByVerse.get(row.verse) ?? 0}
                        inFocus={
                          focusRange != null && row.verse >= focusRange[0] && row.verse <= focusRange[1]
                        }
                        roving={rovingVerse('compare') === row.verse}
                        html={compareVerseHtml.get(row.verse) ?? EMPTY_VERSE_HTML}
                        onFocusVerse={handleVerseFocus}
                        onActivate={handleVerseActivate}
                        onKeys={handleVerseKeys}
                      />
                    )}
                  </p>
                </div>
              ))
            ) : verseLayout === 'prose' ? (
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
                        column="primary"
                        selected={
                          selection != null &&
                          selection.column === 'primary' &&
                          verse.number >= selection.start &&
                          verse.number <= selection.end
                        }
                        accent={highlights?.get(verse.number)?.accent}
                        noteCount={noteCountByVerse.get(verse.number) ?? 0}
                        inFocus={
                          focusRange != null &&
                          verse.number >= focusRange[0] &&
                          verse.number <= focusRange[1]
                        }
                        roving={rovingVerse('primary') === verse.number}
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
                      column="primary"
                      selected={
                        selection != null &&
                        selection.column === 'primary' &&
                        verse.number >= selection.start &&
                        verse.number <= selection.end
                      }
                      accent={highlights?.get(verse.number)?.accent}
                      noteCount={noteCountByVerse.get(verse.number) ?? 0}
                      inFocus={
                        focusRange != null &&
                        verse.number >= focusRange[0] &&
                        verse.number <= focusRange[1]
                      }
                      roving={rovingVerse('primary') === verse.number}
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

        </div>

        {/*
          The page ahead, as paper — the same pile as above, mirrored under the sheet.

          This was a floating pill, which worked and said the wrong thing: one direction drawn as
          paper and the other as a button made turning forward a different kind of act from
          turning back. They are the same act. Under the sheet the chapter ahead peeks the way
          the one behind does, and the page sits between them where a page in a book is.

          It costs the thing the pill was for — reaching it means scrolling the chapter — and
          that is the honest trade rather than an oversight. The pile above costs the same to
          reach, and a book does too.

          Absent at Revelation 22, where `adjacentChapter` returns null: the canon runs out, and
          an edge there would be paper asserting there is another page.
        */}
        {onNavigateTo && data && !paperStack ? (
          <PrototypeReaderChapterStack
            book={data.book}
            chapter={data.chapter}
            translation={data.translation}
            direction="ahead"
            onSelect={onNavigateTo}
          />
        ) : null}
      </div>

      {readerToolbar}

      {/* Every reader action lands in the shell's study dock — the same components a note
          opens, in the same carousel, so several can be up at once and the active one centres
          over the paper. */}
      {studyDockStackHasEntries(dockStack) && studyDockCarouselHostEl
        ? createPortal(
            <StudyDockCarouselWeb
              stack={dockStack}
              onSelectEntry={(id) => setDockStack((s) => setActiveDockEntry(s, id))}
              onMoveEntry={(id, toIndex) => setDockStack((s) => moveDockEntryToIndex(s, id, toIndex))}
              renderEntry={(entry, isActive) => {
                const expanded = isActive && entry.expanded;
                const close = () => setDockStack((s) => closeDockEntry(s, entry.id));
                const setExpanded = (next: boolean) =>
                  setDockStack((s) => updateDockEntry(s, entry.id, (e) => ({ ...e, expanded: next })));

                if (entry.kind === 'reference') {
                  const anchor = entry.session.readerAnchor;
                  const saved = !!anchor?.savedReferenceId;
                  return (
                    <ReferenceDockWeb
                      key={entry.id}
                      initialQuery={entry.session.query}
                      onDone={close}
                      // Pending only when this exact word hasn't already been saved against this
                      // exact passage — `savedReferenceId` is looked up before the dock even opens
                      // (see `lookupSavedReferenceId`), so a word saved on an earlier visit shows
                      // its saved chrome immediately instead of the Save button all over again.
                      pendingSuggestion={!saved && !!onSaveReference}
                      // Drives the header's accent colour: without this a saved word's dock looked
                      // exactly as neutral as one that was never saved at all, the same "nothing
                      // visibly changed" gap the save button itself had.
                      passageReferenceSaved={saved}
                      saveReferenceLabel={saveReferenceLabel}
                      onSaveReference={
                        onSaveReference && anchor
                          ? () => {
                              // Wait for the result: closing unconditionally made a save that
                              // silently failed (offline, space not ready yet) look identical to
                              // one that worked — the dock vanished either way. `false` keeps it
                              // open so there's something to retry against.
                              void Promise.resolve(
                                onSaveReference({
                                  word: entry.session.query,
                                  reference: anchor.reference,
                                  verse: anchor.verse,
                                }),
                              ).then((ok) => {
                                if (ok !== false) close();
                              });
                            }
                          : undefined
                      }
                      onOpenScripturePassage={(ref) => onOpenDock?.(ref)}
                    />
                  );
                }

                if (entry.kind === 'scripture') {
                  return (
                    <ScripturePillChromeWeb
                      key={entry.id}
                      reference={entry.session.reference}
                      translation={entry.session.translation ?? translation}
                      interactionActive={isActive}
                      animateEnter={false}
                      expanded={expanded}
                      onExpandedChange={setExpanded}
                      // No pill to write back to: the passage is already the document behind this
                      // dock, so editing the reference here would mean editing what you are reading.
                      readOnly
                      // "Passages" is the shuffle icon precisely because this dock is for cross-
                      // references — opening on the plain verse text would make the button's own
                      // promise a second tap away.
                      initialShowCrossRefs
                      editorChromeMode="prototypeNative"
                      onDone={close}
                      onApply={() => undefined}
                      onOpenPassageReference={(word) =>
                        openReferenceDock({
                          query: word,
                          anchor: entry.session.reference,
                          savedReferenceId: lookupSavedReferenceId(entry.session.reference, word),
                        })
                      }
                      onOpenScripturePassage={(ref) => onOpenDock?.(ref)}
                    />
                  );
                }

                // The reader opens three kinds; `resource` belongs to notes and cannot appear
                // here, but the union says otherwise so the narrowing has to be explicit.
                if (entry.kind !== 'highlight') return null;
                const range = entry.session.range;
                return (
                  <HighlightDockWeb
                    key={entry.id}
                    accent={entry.session.accent}
                    excerpt={entry.session.excerpt}
                    focusTitle={entry.session.focusTitle}
                    miniNoteBody={entry.session.miniNoteBody}
                    entryKind="scriptureLink"
                    studyThreadEntryId={entry.session.studyThreadEntryId}
                    contextSpaceId={homeSpaceId}
                    onAccentChange={(next) => {
                      setAccent(next);
                      // The card's own verses, not whatever the reader last focused. With
                      // several cards up, the one being recoloured is not necessarily the one
                      // the chapter is faded to.
                      if (range) {
                        onHighlight?.(
                          { start: range.from, end: range.to },
                          next,
                          entry.session.excerpt,
                          // No passage text: a recolour re-writes the row it already has, and
                          // this is the same absent 4th argument it has always passed.
                          undefined,
                          // The version this card is of, so recolouring one made in the second
                          // column does not write against the page's translation instead.
                          entry.session.scripturePassageTranslation ?? undefined,
                        );
                      }
                      setDockStack((s) =>
                        updateDockEntry(s, entry.id, (e) =>
                          e.kind === 'highlight' ? { ...e, session: { ...e.session, accent: next } } : e,
                        ),
                      );
                    }}
                    onRemove={() => {
                      if (entry.session.studyThreadEntryId) {
                        onRemoveHighlight?.(
                          entry.session.studyThreadEntryId,
                          entry.session.scripturePassageTranslation ?? undefined,
                        );
                      }
                      close();
                    }}
                    onDone={close}
                  />
                );
              }}
            />,
            studyDockCarouselHostEl,
          )
        : null}
    </div>
  );
}
