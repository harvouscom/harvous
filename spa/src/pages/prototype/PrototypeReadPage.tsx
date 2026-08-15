/**
 * Route shell for the Bible reader — `/read/{book}/{chapter}`.
 *
 * Owns URL ↔ reader binding only; the reading surface itself is
 * `PrototypeBibleReaderPane`, so it can also be mounted over/under other
 * surfaces later (paper stack, split view) without dragging routing along.
 */
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { prototypeReadRouteTo } from '@/lib/prototype-path';
import { buildVotdScripturePillHtml } from '../../lib/votd-scripture-pill-html';
import { useProfile } from '../../hooks/queries/useProfile';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useProtoShell } from '../../layouts/proto-shell-context';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { noteParamSlug } from './proto-route-slugs';
import { prototypeNoteRouteTo } from '@/lib/prototype-path';
import { createPortal } from 'react-dom';
import PrototypeMainPaneShell from './PrototypeMainPaneShell';
import PrototypeBibleReaderPane from './PrototypeBibleReaderPane';
import PrototypeReaderInspectorPane from './PrototypeReaderInspectorPane';
import { usePrototypeBibleChapter } from '../../hooks/queries/usePrototypeBibleChapter';
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
  const search = useSearch({ strict: false }) as { v?: string; t?: string };
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  const {
    beginPrototypeComposeSession,
    stackNoteOverReader,
    inspectorOpen,
    inspectorExiting,
    closeInspector,
    isMobileSidebar,
  } = useProtoShell();
  /**
   * Try-a-face for this reading session. Deliberately component state, not a preference:
   * it lasts as long as you are here and never overwrites the default in Appearance.
   */
  const [fontOverride, setFontOverride] = useState<FontChoice | null>(null);
  const book = decodeURIComponent(params.book ?? '');
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
  const createHighlight = useCreateChapterHighlight(book, chapter, translation);

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

  const applyHighlight = useCallback(
    ({ start, end }: { start: number; end: number }, accent: StudyHighlightAccentKey) => {
      const reference =
        start === end ? `${book} ${chapter}:${start}` : `${book} ${chapter}:${start}-${end}`;
      createHighlight.mutate({ reference, accent });
    },
    [book, chapter, createHighlight],
  );

  const handleNavigateTo = useCallback(
    (nextBook: string, nextChapter: number) => {
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book: nextBook, chapter: String(nextChapter) },
        // Drop `v`: a verse focus belongs to the chapter it was linked into.
        search: { v: undefined, t: search.t },
      });
    },
    [navigate, search.t],
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
      stackNoteOverReader({ book, chapter, translation, fromVerse: start });
    },
    [book, chapter, translation, homeSpaceId, beginPrototypeComposeSession, stackNoteOverReader],
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
        params: { book: parsed.book, chapter: String(parsed.chapter) },
        search: { v: verse ? String(verse) : undefined, t: search.t },
      });
    },
    [navigate, search.t],
  );

  const handleOpenNote = useCallback(
    (noteId: string) => {
      // Stack it over the chapter rather than replacing it — the passage is the context
      // the note was written about, and the reader should still be there behind it.
      stackNoteOverReader({ book, chapter, translation, fromVerse: focusVerse });
      void navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: {},
      });
    },
    [book, chapter, translation, focusVerse, stackNoteOverReader, navigate],
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
      stackNoteOverReader({ book, chapter, translation, fromVerse: focusVerse });
      void navigate({
        to: prototypeNoteRouteTo(),
        params: { noteId: noteParamSlug(noteId) },
        search: { scriptureRef: reference, scriptureTranslation: translation },
      });
    },
    [book, chapter, translation, focusVerse, stackNoteOverReader, navigate],
  );

  // Reuses the reader's own cached chapter query, so opening the inspector costs nothing.
  const { data: chapterData } = usePrototypeBibleChapter(book, chapter, translation);

  const handleChangeTranslation = useCallback(
    (next: string) => {
      void navigate({
        to: prototypeReadRouteTo(),
        params: { book, chapter: String(chapter) },
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
    <PrototypeMainPaneShell>
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
        />
      </div>
    </PrototypeMainPaneShell>
  );
}
