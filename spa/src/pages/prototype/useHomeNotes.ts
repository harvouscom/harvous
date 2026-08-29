/**
 * The note list Home is about, for a surface that is not the sidebar.
 *
 * The sidebar receives its notes as props from `PrototypeSidebar`, which owns the paging.
 * Activity has no such parent, so this hook does that job: fetch, de-duplicate across page
 * boundaries, drop the empties, and report whether there is more.
 *
 * It used to derive the greeting's lead theme and counts as well — hence its old name — which
 * put a second definition of "the book you keep coming back to" beside the sidebar's. Both are
 * now `useHomeSurfaceData`'s, computed once from what this returns. What is left here is only
 * the fetching, which genuinely differs between the two surfaces.
 *
 * The queries are the same ones the sidebar already runs, so the extra cost is a cache read
 * rather than a round trip — React Query dedupes them by key.
 */
import { useMemo } from 'react';
import { usePrototypeHomeSpaceId } from '../../hooks/usePrototypeHomeSpaceId';
import { useSpaceNotes } from '../../hooks/queries/useSpace';

import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import { sortNotesByLastUpdated } from '@/utils/sorting';
import { isEffectivelyEmptyPrototypeNote } from '@/utils/prototype-note-empty';

export interface HomeNotes {
  notes: SpaceNoteRow[];
  /** The same list keyed by id — every caller was building this map itself. */
  notesById: Map<string, SpaceNoteRow>;
  /** The server's count, or null while the list is short enough not to need one. */
  noteTotal: number | null;
  hasMoreNotes: boolean;
  /** False until the notes that decide the sentence have landed. */
  ready: boolean;
}

/**
 * @param overrideSpaceId a space to read instead of personal Home — a shared space in scope.
 *   The flatten and de-duplication are the same job whatever the space, and this was the
 *   third copy of them.
 */
export function useHomeNotes(overrideSpaceId?: string | null): HomeNotes {
  const { homeSpaceId: personalSpaceId } = usePrototypeHomeSpaceId();
  const homeSpaceId = overrideSpaceId ?? personalSpaceId;
  /* Every query here is space-scoped and gated on having one — the hooks handle a null id by
     staying idle, so the greeting simply has nothing to say until Home resolves. */
  const spaceId = homeSpaceId ?? undefined;
  const notesQuery = useSpaceNotes(spaceId ?? '', 20);

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

  /* The count arithmetic these two feed is `useHomeSurfaceData`'s, so the sidebar and the
     day sheet cannot disagree about how many notes a library holds. */
  const hasMoreNotes = notesQuery.hasNextPage ?? false;

  const notesById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  return {
    notes,
    notesById,
    noteTotal: total,
    hasMoreNotes,
    ready: Boolean(homeSpaceId) && !notesQuery.isPending,
  };
}
