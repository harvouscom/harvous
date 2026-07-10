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
