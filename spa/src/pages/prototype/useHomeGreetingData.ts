/**
 * The facts a greeting is built from, for a surface that is not the sidebar.
 *
 * `PrototypeSidebarHomeView` derives these inline among fifty other things, which was fine
 * while it was the only surface that opened with a sentence. Activity opens with one too, and
 * copying the derivation into the day sheet would leave two definitions of "the book you keep
 * coming back to" free to disagree.
 *
 * The queries are the same ones the sidebar already runs, so the extra cost is a cache read
 * rather than a round trip — React Query dedupes them by key.
 */
import { useMemo } from 'react';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useSpaceNotes } from '../../hooks/queries/useSpace';
import { useTagsList } from '../../hooks/queries/useTagsList';
import { usePrototypeStudyThreads } from '../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeSpaceScriptureIndex } from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import {
  deriveTopBooks,
  deriveTopFolders,
  deriveTopTags,
  deriveTopThread,
  selectHomeLeadTheme,
  type HomeLeadTheme,
} from '@/utils/prototype-home-trends';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { sortNotesByLastUpdated } from '@/utils/sorting';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';

export interface HomeGreetingData {
  notes: SpaceNoteRow[];
  countForLogic: number;
  hasMoreForLogic: boolean;
  lead: HomeLeadTheme;
  /** False until the notes that decide the sentence have landed. */
  ready: boolean;
}

export function useHomeGreetingData(): HomeGreetingData {
  const { homeSpaceId } = usePrototypeHomeSpaceId();
  /* Every query here is space-scoped and gated on having one — the hooks handle a null id by
     staying idle, so the greeting simply has nothing to say until Home resolves. */
  const spaceId = homeSpaceId ?? undefined;
  const notesQuery = useSpaceNotes(spaceId ?? '', 20);
  const tagsQuery = useTagsList();
  const threadsQuery = usePrototypeStudyThreads(spaceId);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(spaceId);

  /*
   * De-duplicated and stripped of blanks, exactly as `PrototypeSidebar` does before handing
   * the same list to the same greeting. Flattening the raw pages instead is what made the
   * chip read "30 notes" on the day sheet while the sidebar said 27: a page boundary can
   * repeat a row, and a note with no title and no body is not one the sentence should count.
   */
  const notes = useMemo(() => {
    const flat = notesQuery.data?.pages.flatMap((page) => page.notes) ?? [];
    const byId = new Map<string, SpaceNoteRow>();
    for (const note of flat) {
      const existing = byId.get(note.id);
      if (!existing) {
        byId.set(note.id, note);
        continue;
      }
      const existingUpdated = existing.updatedAt ?? existing.createdAt ?? '';
      const noteUpdated = note.updatedAt ?? note.createdAt ?? '';
      if (noteUpdated >= existingUpdated) byId.set(note.id, note);
    }
    return sortNotesByLastUpdated(Array.from(byId.values())).filter(
      (n: SpaceNoteRow) => !isEffectivelyEmptyPrototypeNote(n.title, n.content),
    );
  }, [notesQuery.data]);
  const total = notesQuery.data?.pages[0]?.total ?? null;

  /*
   * The same arithmetic the sidebar does, because the two now say the same sentence and a
   * library cannot be 27 notes on one surface and 30 on the other.
   *
   * When everything is loaded the loaded count *is* the count; only a truncated list needs
   * the server's total, and only an unknown total leaves "27+" on the chip.
   */
  const hasMoreNotes = notesQuery.hasNextPage ?? false;
  const countForLogic = !hasMoreNotes ? notes.length : (total ?? notes.length);
  const hasMoreForLogic = hasMoreNotes && total == null;

  const threads = threadsQuery.data ?? [];
  const scriptureBooks = scriptureQuery.data ?? [];
  const tags = tagsQuery.data?.tags ?? [];

  const lead = useMemo(
    () =>
      selectHomeLeadTheme({
        thread: deriveTopThread(threads, 1)[0],
        book: deriveTopBooks(scriptureBooks, 1)[0],
        folder: deriveTopFolders(notes, 1)[0],
        tag: deriveTopTags(tags, 1)[0],
        noteCount: countForLogic,
        hasMoreNotes: hasMoreForLogic,
        today: new Date(),
      }),
    [threads, scriptureBooks, notes, tags, countForLogic, hasMoreForLogic],
  );

  return {
    notes,
    countForLogic,
    hasMoreForLogic,
    lead,
    ready: Boolean(homeSpaceId) && !notesQuery.isPending,
  };
}
