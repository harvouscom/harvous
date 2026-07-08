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
