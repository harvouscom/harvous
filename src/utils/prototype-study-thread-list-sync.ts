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
  spaceId: string,
  parentNoteId?: string | null,
): void {
  const sid = normalizePrototypeApiSpaceId(spaceId);
  queryClient.invalidateQueries({
    queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
  });
  queryClient.invalidateQueries({
    queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
  });
  if (parentNoteId) {
    queryClient.invalidateQueries({ queryKey: ['note', parentNoteId] });
  }
}

/** Convenience for editor components after raw fetch mutations. */
export function notifyStudyThreadListChanged(
  spaceId: string | null | undefined,
  parentNoteId: string | null | undefined,
): void {
  if (!spaceId || !parentNoteId) return;
  dispatchStudyThreadListChanged({ spaceId, parentNoteId });
}
