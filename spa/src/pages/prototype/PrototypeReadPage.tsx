/**
 * Route shell for the Bible reader — `/read/{book}/{chapter}`.
 *
 * Owns URL ↔ reader binding only; the reading surface itself is
 * `PrototypeBibleReaderPane`, so it can also be mounted over/under other
 * surfaces later (paper stack, split view) without dragging routing along.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { prototypeReadRouteTo } from '@/lib/prototype-path';
import { bookFromSlug, bookSlug } from '@/utils/bible-book-chapters';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { useProfile } from '../../hooks/queries/useProfile';
import { getNoteQueryOptions } from '../../hooks/queries/useNote';
import {
  saveReaderReferenceStudyThread,
  saveReferenceStudyThread,
} from '@/utils/save-reference-study-thread';
import { notifyStudyThreadListChanged } from '@/utils/prototype-study-thread-list-sync';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useProtoShell, type PaperStackOrigin } from '../../layouts/proto-shell-context';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { noteParamSlug, normalizeNoteIdFromParam } from './proto-route-slugs';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { createPortal } from 'react-dom';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import { useShellPaneIsWide } from '../../layouts/use-shell-pane-wide';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';
import PrototypeReaderInspectorPane from './PrototypeReaderInspectorPane';
import { usePrototypeBibleChapter } from '../../hooks/queries/usePrototypeBibleChapter';
import { useReadingSession } from '../../hooks/useReadingSession';
import type { FontChoice } from '../../lib/proto-font-prefs';
import type { ReaderVerseHighlight } from './PrototypeBibleReaderPane';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';
import {
  usePrototypeChapterHighlights,
  useCreateChapterHighlight,
} from '../../hooks/queries/usePrototypeChapterHighlights';

/**
 * Verse numbers a stored reference covers: "Exodus 5:3" → [3], "Exodus 5:3-5" → [3,4,5].
 *
 * Deliberately not `parseScriptureReference`: that resolves book names and chapter ranges
 * across the whole canon, and all this needs is the verse tail of a reference the reader
 * already knows the book and chapter of.
 */
function versesInReference(reference: string | null): number[] {
  if (!reference) return [];
  const tail = reference.split(':')[1];
  if (!tail) return [];
  const [startRaw, endRaw] = tail.split('-');
  const start = Number.parseInt(startRaw, 10);
  if (!Number.isFinite(start)) return [];
  const end = endRaw ? Number.parseInt(endRaw, 10) : start;
  if (!Number.isFinite(end) || end < start) return [start];
  const out: number[] = [];
  for (let v = start; v <= end; v += 1) out.push(v);
  return out;
}

export default function PrototypeReadPage() {
  const params = useParams({ strict: false }) as { book?: string; chapter?: string };
  const search = useSearch({ strict: false }) as {
    v?: string;
    t?: string;
    ref?: string;
    req?: string;
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: profile } = useProfile();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const {
    beginPrototypeComposeSession,
    stackNote,
    paperStack,
    inspectorOpen,
    inspectorExiting,
    closeInspector,
    isMobileSidebar,
  } = useProtoShell();
  const paneIsWide = useShellPaneIsWide();
  /**
   * Try-a-face for this reading session. Deliberately component state, not a preference:
   * it lasts as long as you are here and never overwrites the default in Appearance.
   */
  const [fontOverride, setFontOverride] = useState<FontChoice | null>(null);
  /*
   * The path segment is a slug — "song-of-solomon". `bookFromSlug` also accepts the older
   * space form, so links shared before the slug existed keep resolving; falling back to the
   * raw segment leaves an unknown book to fail where it already did, in the chapter fetch,
   * rather than turning a typo into a blank screen here.
   */
  const rawBook = decodeURIComponent(params.book ?? '');
  const book = bookFromSlug(rawBook) ?? rawBook;
  const chapter = Number.parseInt(params.chapter ?? '', 10);
  const focusVerse = search.v ? Number.parseInt(search.v, 10) : undefined;

  // URL wins so a shared link reads in the translation it was shared in; otherwise
  // the reader follows the account's default rather than a hardcoded one.
  const translation = (search.t || profile?.defaultTranslation || 'NET').toUpperCase();

  /**
   * Highlights on this chapter, from the one store that holds all of them — made here while
   * reading, or made in any note's scripture dock. The reader paints; it does not own.
   */
  const { data: chapterHighlights } = usePrototypeChapterHighlights(book, chapter, translation);
  const createHighlight = useCreateChapterHighlight(book, chapter, translation, homeSpaceId);

  /**
   * Fan the stored rows out to the verses they cover. A row is anchored to a reference, which
   * may be a range ("Exodus 5:3-5"), while the reader paints per verse.
   */
  const highlights = useMemo(() => {
    const map = new Map<number, ReaderVerseHighlight>();
    for (const h of chapterHighlights ?? []) {
      for (const v of versesInReference(h.scriptureReference)) {
        map.set(v, { accent: h.highlightAccent, studyThreadEntryId: h.id });
      }
    }
    return map;
  }, [chapterHighlights]);

  /*
   * Tidy an old-style address into the slug, in place.
   *
   * Someone arriving on `/read/Song%20of%20Solomon/2` from a link shared before slugs existed
   * gets the chapter either way — but they may well be about to copy the URL onward, and it
   * should be the clean one by then. `replace` so it does not cost them a back-button press,
   * and gated on the segment actually differing so this cannot loop.
   */
  useEffect(() => {
    if (!book || !Number.isInteger(chapter)) return;
    const canonical = bookSlug(book);
    if (rawBook === canonical) return;
    void navigate({
      to: prototypeReadRouteTo(),
      params: { book: canonical, chapter: String(chapter) },
      search: { v: search.v, t: search.t },
      replace: true,
    });
  }, [book, rawBook, chapter, navigate, search.v, search.t]);

  /*
   * A saved reference tapped in the list asks the reader to open that word's card on arrival.
   * The anchor is rebuilt from where we actually landed rather than carried in the URL — the
   * chapter is already in the path, so the word is the only thing the link has to say.
   */
  const referenceRequest = useMemo(() => {
    const word = search.ref?.trim();
    if (!word) return null;
    return {
      word,
      anchor: Number.isFinite(focusVerse)
        ? `${book} ${chapter}:${focusVerse}`
        : `${book} ${chapter}`,
      verse: Number.isFinite(focusVerse) ? focusVerse : undefined,
      requestKey: search.req || word,
    };
  }, [search.ref, search.req, book, chapter, focusVerse]);

  const applyHighlight = useCallback(
    (
      { start, end }: { start: number; end: number },
      accent: StudyHighlightAccentKey,
      excerpt: string,
    ) => {
      const reference =
        start === end ? `${book} ${chapter}:${start}` : `${book} ${chapter}:${start}-${end}`;
      createHighlight.mutate({ reference, accent, excerpt });
    },
    [book, chapter, createHighlight],
  );

  const handleNavigateTo = useCallback(
    (nextBook: string, nextChapter: number) => {
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book: bookSlug(nextBook), chapter: String(nextChapter) },
        // Drop `v`: a verse focus belongs to the chapter it was linked into.
        search: { v: undefined, t: search.t },
      });
    },
    [navigate, search.t],
  );

  /**
   * This chapter as the paper a note stacks over. `returnTo` is where flipping the note down
   * lands — this chapter, at the verse the note was started from, in this translation — and
   * it is captured now so it still points here after the note's own URL has changed.
   */
  const readerOrigin = useCallback(
    (fromVerse: number | undefined): PaperStackOrigin => ({
      kind: 'reader',
      label: `${book} ${chapter}`,
      icon: 'scroll',
      returnTo: {
        to: prototypeReadRouteTo(),
        // Slugged at capture — the route reads a slug, and this is a route, not a display.
        params: { book: bookSlug(book), chapter: String(chapter) },
        search: { v: fromVerse ? String(fromVerse) : undefined, t: translation },
      },
      base: { type: 'reader', book, chapter, translation, fromVerse },
    }),
    [book, chapter, translation],
  );

  /**
   * The signature move: chosen verses become a note that slides over the chapter.
   *
   * No navigation — the compose session opens on this same `/read/...` address and the
   * shell stacks the editor above the reader, so the chapter stays mounted behind it and
   * flipping back is a move rather than a page load. The pill is seeded so the note is
   * already anchored to what was selected.
   */
  const handleStartNote = useCallback(
    ({ start, end }: { start: number; end: number }) => {
      const reference =
        start === end ? `${book} ${chapter}:${start}` : `${book} ${chapter}:${start}-${end}`;
      beginPrototypeComposeSession({
        targetSpaceId: homeSpaceId ?? undefined,
        seed: { contentHtml: buildVotdScripturePillHtml(reference, translation) },
      });
      stackNote(readerOrigin(start));
    },
    [homeSpaceId, beginPrototypeComposeSession, stackNote, readerOrigin, book, chapter, translation],
  );

  /**
   * Keep a word you looked up while reading.
   *
   * Two versions of the same action, differing only in what the reference ends up anchored
   * to — and the label says which you are getting:
   *
   * - A note is already in play (you came here from one, or opened one over the chapter):
   *   the reference joins that note, exactly as saving from its own scripture dock would.
   * - Nothing is in play: it is saved against the passage instead, and shows up in the
   *   references list like any other.
   *
   * This used to make a whole note to hold the second case, because a reference was assumed
   * to need a parent. It does not: the row's parent note is nullable and reading highlights
   * have always been written without one. Saving a word is not a reason to create a document.
   */
  /*
   * The note in play, from either side of the stack. `noteId` is the note when it is the
   * sheet — parked below a chapter you flipped up to. A dock expansion is the other
   * direction: the chapter is the sheet and the note is the origin, so the stack carries no
   * note id and the note is the one its `returnTo` points at. Both are "a note is already
   * open here", and missing the second would offer to start a second note while the first
   * is sitting right underneath.
   */
  const stackedNoteId = useMemo(() => {
    if (paperStack?.noteId) return paperStack.noteId;
    if (paperStack?.origin.kind !== 'noteDock') return null;
    const slug = paperStack.origin.returnTo.params?.noteId;
    return slug ? normalizeNoteIdFromParam(slug) || null : null;
  }, [paperStack]);
  const saveReferenceLabel = stackedNoteId ? 'Save to your note' : 'Save this reference';
  const handleSaveReference = useCallback(
    ({ word, reference }: { word: string; reference: string; verse?: number }) => {
      void (async () => {
        if (stackedNoteId) {
          await saveReferenceStudyThread({
            noteId: stackedNoteId,
            word,
            reference,
            translation,
            spaceId: homeSpaceId,
          });
          notifyStudyThreadListChanged(homeSpaceId, stackedNoteId);
          return;
        }

        if (!homeSpaceId) return;
        await saveReaderReferenceStudyThread({
          word,
          reference,
          translation,
          spaceId: homeSpaceId,
        });
        // No note id to pass — the list invalidation is what matters, and it only no-ops when
        // both ids are missing.
        notifyStudyThreadListChanged(homeSpaceId, null);
      })();
    },
    [stackedNoteId, translation, homeSpaceId],
  );

  /**
   * A cross-reference is a place to go, not a card to read. Tapping one moves the reader
   * to that passage, so following a chain of references is the same gesture repeated rather
   * than a growing stack of popovers.
   */
  const handleOpenReference = useCallback(
    (ref: string) => {
      const parsed = parseScriptureReference(ref);
      if (!parsed) return;
      const verse = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
        search: { v: verse ? String(verse) : undefined, t: search.t },
      });
    },
    [navigate, search.t],
  );

  const handleOpenNote = useCallback(
    (noteId: string) => {
      // Stack it over the chapter rather than replacing it — the passage is the context
      // the note was written about, and the reader should still be there behind it.
      stackNote(readerOrigin(focusVerse), noteId);
      void navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: {},
      });
    },
    [focusVerse, stackNote, readerOrigin, navigate],
  );

  /**
   * Open a margin note with its scripture dock already on the passage you tapped.
   *
   * `scriptureRef` is the note page's existing way in — the same parameter the Home cards use
   * — so this lands you exactly where the passage is under discussion rather than at the top
   * of a note you then have to search. The reader stays stacked behind it.
   */
  const handleOpenNoteAtReference = useCallback(
    (noteId: string, reference: string) => {
      stackNote(readerOrigin(focusVerse), noteId);
      void navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: { scriptureRef: reference, scriptureTranslation: translation },
      });
    },
    [focusVerse, stackNote, readerOrigin, translation, navigate],
  );

  /**
   * Warm the note query cache while a margin-note row is hovered/focused/pinned, before the
   * tap that navigates to it. The sidebar already does this for its own rows
   * (`PrototypeSidebar.tsx`'s `prefetchNote`); the reader had nothing, so every margin-bar
   * tap opened a note cold and paid for the full round trip behind the grace-gated dots.
   *
   * No `contextSpaceId` here, matching `handleOpenNoteAtReference`'s navigation above (no
   * `space=` in its search) — both resolve to the same unscoped `['note', noteId]` cache key.
   */
  const handlePrefetchNote = useCallback(
    (noteId: string) => {
      void queryClient.prefetchQuery(getNoteQueryOptions(noteId)).catch(() => {});
    },
    [queryClient],
  );

  // Reuses the reader's own cached chapter query, so opening the inspector costs nothing.
  const { data: chapterData } = usePrototypeBibleChapter(book, chapter, translation);

  /**
   * Record the read. Marks the position as soon as the chapter is on screen and logs how long
   * it was held open when you leave, which is what lets Home offer to pick this back up — and
   * what tells "read it" apart from "opened it and moved on".
   *
   * Gated on the verses actually being here: a chapter that failed to load was not read.
   * `chapterData.book` rather than the URL slug, so the log stores canonical book names.
   */
  useReadingSession({
    canonicalReference: chapterData ? `${chapterData.book} ${chapter}` : undefined,
    translationCode: translation,
    enabled: Boolean(chapterData?.verses.length),
  });

  const handleChangeTranslation = useCallback(
    (next: string) => {
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book: bookSlug(book), chapter: String(chapter) },
        // Pin it in the URL so the choice survives a reload and travels in a shared link.
        search: { v: search.v, t: next },
      });
    },
    [navigate, book, chapter, search.v],
  );

  const readerInspector = (
    <PrototypeReaderInspectorPane
      book={chapterData?.book ?? book}
      chapter={chapter}
      translation={translation}
      verseCount={chapterData?.verses.length}
      onChangeTranslation={handleChangeTranslation}
      fontOverride={fontOverride}
      onChangeFontOverride={setFontOverride}
    />
  );

  // Same portal target and chrome classes as the note inspector — one inspector surface,
  // two kinds of content, rather than a second panel that happens to look similar.
  const rightPanelHost =
    typeof document !== 'undefined'
      ? document.querySelector('.proto-shell__right-panel-host') ?? document.body
      : null;
  const inspectorVisible = inspectorOpen || inspectorExiting;
  /*
   * Dock the panel beside the chapter when there is room, exactly as a note does.
   *
   * The reader used to let it float over the text unconditionally, on the theory that a
   * centred column sits in whitespace anyway. It does not: the column is 720px wide and the
   * panel took the last ~100px of it, so adjusting the type size covered the verses you
   * were adjusting it for.
   */
  const inspectorDocked = inspectorOpen && !inspectorExiting && !isMobileSidebar && paneIsWide;
  const inspectorLayer =
    inspectorVisible && rightPanelHost
      ? createPortal(
          isMobileSidebar ? (
            <>
              <div
                className="proto-inspector-mobile-backdrop"
                role="presentation"
                tabIndex={-1}
                onClick={closeInspector}
              />
              <div
                className={`proto-inspector-mobile-panel${inspectorExiting ? ' proto-inspector-mobile-panel--exiting' : ''}`}
                role="dialog"
                aria-label="Reading details"
              >
                {readerInspector}
              </div>
            </>
          ) : (
            <div
              className={`proto-inspector-desktop${inspectorExiting ? ' proto-inspector-desktop--exiting' : ''}`}
              role="dialog"
              aria-label="Reading details"
            >
              {readerInspector}
            </div>
          ),
          rightPanelHost,
        )
      : null;

  return (
    <PrototypeMainPaneShell
      className={inspectorDocked ? 'proto-main-pane--inspector-docked' : undefined}
    >
      {inspectorLayer}
      <div className="pds-reader-with-dock">
        <PrototypeBibleReaderPane
          book={book}
          chapter={chapter}
          translation={translation}
          focusVerse={Number.isFinite(focusVerse) ? focusVerse : undefined}
          onNavigateTo={handleNavigateTo}
          onStartNote={handleStartNote}
          // A cross-reference tapped inside the scripture dock is a place to go, not another
          // card to stack — it moves the reader, and the dock re-describes where you landed.
          onOpenDock={handleOpenReference}
          fontOverride={fontOverride}
          highlights={highlights}
          onHighlight={applyHighlight}
          // Annotate records the highlight; the pane opens the highlight dock over it, so the
          // dock lifecycle stays with the surface that owns the selection.
          onAnnotate={applyHighlight}
          onOpenNoteAtReference={handleOpenNoteAtReference}
          onPrefetchNote={handlePrefetchNote}
          onSaveReference={handleSaveReference}
          saveReferenceLabel={saveReferenceLabel}
          referenceRequest={referenceRequest}
          landRequestKey={search.req}
        />
      </div>
    </PrototypeMainPaneShell>
  );
}
