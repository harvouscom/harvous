import type { QueryClient } from '@tanstack/react-query';

export const STUDY_THREAD_LIST_CHANGED_EVENT = 'studyThreadListChanged';

export type StudyThreadListChangedDetail = {
  spaceId: string;
  parentNoteId: string;
};

function normalizePrototypeApiSpaceId(spaceId: string): string {
  const trimmed = spaceId.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith('space_') ? trimmed : `space_${trimmed}`;
}

/** Notify prototype sidebar / caches that study-thread highlight rows changed. */
export function dispatchStudyThreadListChanged(detail: StudyThreadListChangedDetail): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<StudyThreadListChangedDetail>(STUDY_THREAD_LIST_CHANGED_EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

export function invalidatePrototypeStudyThreadListQueries(
  queryClient: QueryClient,
  spaceId: string | undefined,
  parentNoteId?: string | null,
): void {
  if (spaceId) {
    const sid = normalizePrototypeApiSpaceId(spaceId);
    queryClient.invalidateQueries({
      queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
    });
    queryClient.invalidateQueries({
      queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
    });
  }
  if (parentNoteId) {
    queryClient.invalidateQueries({ queryKey: ['note', parentNoteId] });
  }
  /*
   * The reader's own painted chapter — `chapterHighlightsKey(book, chapter, translation)` in
   * usePrototypeChapterHighlights. Invalidated by prefix because a caller writing one row
   * (the highlight dock PATCHing an annotation onto it) knows the row but not which chapter
   * or translation it is being read in.
   *
   * Nothing invalidated this after an annotation write, and the dock reads its opening text
   * from this cache — so reopening a note inside the 60s staleTime showed an empty box over
   * words that were saved on the server, and the next keystroke PATCHed that emptiness back
   * over them. "Annotations aren't being saved" was partly this: they were saved, then shown
   * as gone, then actually erased.
   */
  queryClient.invalidateQueries({ queryKey: ['prototype', 'scripture-highlights'] });
  /*
   * Activity is its own query (`['study-feed', scope]`), with a 60s staleTime and a comment
   * that "everything they do here invalidates it explicitly". Nothing did. A highlight made
   * in the reader, or a note erased from Continue, sat invisible until a full refresh.
   * Prefix-match every scope.
   */
  queryClient.invalidateQueries({ queryKey: ['study-feed'] });
}

/**
 * A highlight's annotation was written — same row, different words.
 *
 * Separate from `notifyStudyThreadListChanged` because that one bails when it has neither a
 * space nor a parent note, and this caller often has neither: the highlight dock in the reader
 * writes rows with a null `parentNoteId`, and in guest mode there is no space at all. Bailing
 * there is what left the guest path with no invalidation of its own.
 */
export function notifyHighlightAnnotationSaved(spaceId?: string | null): void {
  dispatchStudyThreadListChanged({ spaceId: spaceId ?? '', parentNoteId: '' });
}

/** Convenience for editor components after raw fetch mutations. */
export function notifyStudyThreadListChanged(
  spaceId: string | null | undefined,
  parentNoteId: string | null | undefined,
): void {
  if (!spaceId && !parentNoteId) return;
  dispatchStudyThreadListChanged({
    spaceId: spaceId ?? '',
    parentNoteId: parentNoteId ?? '',
  });
}
