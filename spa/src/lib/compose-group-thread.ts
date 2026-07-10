const COMPOSE_GROUP_THREAD_KEY = 'harvous_compose_group_thread_id';

export function getComposeGroupThreadId(): string | null {
  try {
    return sessionStorage.getItem(COMPOSE_GROUP_THREAD_KEY);
  } catch {
    return null;
  }
}

export function setComposeGroupThreadId(threadId: string | null) {
  try {
    if (threadId) sessionStorage.setItem(COMPOSE_GROUP_THREAD_KEY, threadId);
    else sessionStorage.removeItem(COMPOSE_GROUP_THREAD_KEY);
  } catch {
    /* ignore */
  }
}

export type DraftDestinationChip =
  | { state: 'hidden' }
  | { state: 'opt-in' | 'active'; threadId: string; threadTitle: string };

/**
 * Destination chip shown in the draft cue while composing in a shared space.
 * `resolvedThreadId` must already be validated against the space's pinned
 * threads (see validComposeThreadSelection), so a stale selection degrades to
 * the opt-in state instead of rendering an active chip for a gone thread.
 */
export function draftDestinationChipModel(input: {
  pinnedThread: { id: string; title: string } | null;
  resolvedThreadId: string | null;
}): DraftDestinationChip {
  if (!input.pinnedThread) return { state: 'hidden' };
  return {
    state: input.resolvedThreadId === input.pinnedThread.id ? 'active' : 'opt-in',
    threadId: input.pinnedThread.id,
    threadTitle: input.pinnedThread.title,
  };
}

/**
 * Start a shared-space compose session and then preselect its real Thread.
 * `beginCompose` clears stale selection first, so ordering is intentional.
 */
export function beginComposeInGroupThread(
  spaceId: string,
  threadId: string,
  beginCompose: (options: { targetSpaceId: string }) => number,
): number {
  const epoch = beginCompose({ targetSpaceId: spaceId });
  setComposeGroupThreadId(threadId);
  return epoch;
}
