import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidatePrototypeStudyThreadListQueries,
  STUDY_THREAD_LIST_CHANGED_EVENT,
  type StudyThreadListChangedDetail,
} from '@/utils/prototype-study-thread-list-sync';

/** Invalidate prototype highlight list caches when editor code mutates study threads. */
export function usePrototypeStudyThreadListSyncListener(homeSpaceId: string | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<StudyThreadListChangedDetail>).detail;
      const spaceId = detail?.spaceId ?? homeSpaceId;
      if (!spaceId) return;
      invalidatePrototypeStudyThreadListQueries(queryClient, spaceId, detail?.parentNoteId);
    };

    window.addEventListener(STUDY_THREAD_LIST_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(STUDY_THREAD_LIST_CHANGED_EVENT, onChanged);
  }, [queryClient, homeSpaceId]);
}
