import type { SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';

export function validComposeThreadSelection(
  selectedId: string | null,
  threads: Array<Pick<SpaceGroupStudyThread, 'id' | 'isPinned'>>,
  isLoading: boolean,
): string | null {
  if (!selectedId || isLoading) return selectedId;
  return threads.some((thread) => thread.id === selectedId && thread.isPinned) ? selectedId : null;
}

export function resolveComposeThreadSelection(
  selectedId: string | null,
  threads: Array<Pick<SpaceGroupStudyThread, 'id' | 'isPinned'>>,
  isLoading: boolean,
): string | null {
  if (isLoading) return selectedId;
  if (selectedId) return validComposeThreadSelection(selectedId, threads, false);
  return threads.find((thread) => thread.isPinned)?.id ?? null;
}
