import type { SpaceGroupStudyThread } from '../../hooks/queries/useSpaceGroupThreads';

/** Real shared-space Threads use `thread_*` ids; study clusters use note ids/slugs. */
export function isSharedSpaceThreadDrillId(id: string | undefined | null): boolean {
  return typeof id === 'string' && id.startsWith('thread_');
}

export function filterSharedSpaceThreads(
  threads: SpaceGroupStudyThread[],
  query: string,
): SpaceGroupStudyThread[] {
  const t = query.trim().toLowerCase();
  if (!t) return threads;
  return threads.filter((thread) => thread.title.toLowerCase().includes(t));
}

export function sharedSpaceThreadsEmptyDescription(canCreate: boolean): string {
  if (canCreate) return 'Start a Thread for this space. You can add notes after.';
  return 'Threads in this space are started by the space owner.';
}
