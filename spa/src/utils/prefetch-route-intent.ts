import type { QueryClient } from '@tanstack/react-query';
import { MY_PILE_THREAD_URL_SEGMENT } from '@/utils/my-pile-thread';
import { getThreadQueryOptions } from '../hooks/queries/useThread';
import { getSpaceBootstrapQueryOptions } from '../hooks/queries/useSpace';

/** Warm React Query cache for thread route (hover / focus before click). */
export function prefetchThreadRouteIntent(queryClient: QueryClient, threadId: string) {
  let id = threadId.startsWith('thread_') ? threadId : `thread_${threadId}`;
  if (id === `thread_${MY_PILE_THREAD_URL_SEGMENT}` || threadId === MY_PILE_THREAD_URL_SEGMENT) {
    id = 'thread_unorganized';
  }
  void queryClient.prefetchQuery(getThreadQueryOptions(id));
}

/** Warm space bootstrap cache (hover / focus before click). */
export function prefetchSpaceRouteIntent(queryClient: QueryClient, spaceId: string) {
  void queryClient.prefetchQuery(getSpaceBootstrapQueryOptions(spaceId));
}
