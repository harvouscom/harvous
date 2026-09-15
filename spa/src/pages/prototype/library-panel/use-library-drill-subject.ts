/**
 * The name a drilled-into Thread goes by, for the panel's back row.
 *
 * A folder drill carries its own name (`folderKey`). A scripture drill often carries only
 * a book ordinal — greeting chips and the study-feed focus chip open that way — so without
 * looking the name up the back row read "Scripture" over "Scripture". A Thread drill carries
 * only an id —
 * every way in (a Thread card, the All tab, a search result, a mention pill) knows the id and
 * not necessarily the name — so without this the back row read "Thread" over "Thread", naming
 * the kind twice and the Thread not at all.
 *
 * Read from the queries the Thread view itself makes, called with the same arguments, so React
 * Query hands both the same cache entry and the header costs no request of its own:
 *
 *  - a personal Thread (a note-graph cluster) from `usePrototypeStudyThread`, whose display name
 *    is the manual title or, failing that, the suggested one;
 *  - a shared `thread_*` record from the space's thread list, since its notes query carries no
 *    title.
 */
import { isSharedSpaceThreadDrillId } from '../shared-space-thread-list';
import { usePrototypeStudyThread } from '../../../hooks/queries/usePrototypeStudyThread';
import { useSpaceGroupThreads } from '../../../hooks/queries/useSpaceGroupThreads';
import { canonicalBookTitle } from '@/utils/scripture-passage-drill';
import type { LibraryPanelView } from './library-panel-view';

/** The display name, or null while there is none worth saying — the header then says "Thread". */
export function resolveThreadDrillSubject(input: {
  personal?: { threadTitle?: string | null; suggestedTitle?: string | null } | null;
  shared?: { title?: string | null } | null;
}): string | null {
  return (
    input.personal?.threadTitle?.trim() ||
    input.personal?.suggestedTitle?.trim() ||
    input.shared?.title?.trim() ||
    null
  );
}

export function useLibraryDrillSubject(
  view: LibraryPanelView,
  spaceId: string | null,
): string | null {
  const threadId = view.drill?.kind === 'thread' ? view.drill.threadId : undefined;
  const shared = isSharedSpaceThreadDrillId(threadId);

  const personalQuery = usePrototypeStudyThread(threadId && !shared ? threadId : undefined, spaceId);
  const groupQuery = useSpaceGroupThreads(threadId && shared ? spaceId ?? undefined : undefined);

  if (view.drill?.kind === 'scripture') {
    const drill = view.drill.drill;
    if (drill.level === 'passages') {
      return drill.bookTitle?.trim() || canonicalBookTitle(drill.bookOrder);
    }
    if (drill.level === 'notes') {
      return drill.passageTitle?.trim() || null;
    }
    return null;
  }

  if (!threadId) return null;
  if (shared) {
    return resolveThreadDrillSubject({
      shared: groupQuery.data?.find((thread) => thread.id === threadId) ?? null,
    });
  }
  /*
   * The study-thread query keeps the previous Thread's data as a placeholder while the next one
   * loads, which is right for its trail and wrong here: moving from one Thread to another would
   * put the first one's name over the second one's notes. Say nothing until the name is this
   * Thread's.
   */
  if (personalQuery.isPlaceholderData) return null;
  return resolveThreadDrillSubject({ personal: personalQuery.data ?? null });
}
