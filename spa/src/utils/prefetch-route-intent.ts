import type { QueryClient } from '@tanstack/react-query';
import { getThreadQueryOptions } from '../hooks/queries/useThread';
import { getSpaceBootstrapQueryOptions } from '../hooks/queries/useSpace';

/** Warm React Query cache for thread route (hover / focus before click). */
export function prefetchThreadRouteIntent(queryClient: QueryClient, threadId: string) {
  const id = threadId.startsWith('thread_') ? threadId : `thread_${threadId}`;
  void queryClient.prefetchQuery(getThreadQueryOptions(id));
}

/** Warm space bootstrap cache (hover / focus before click). */
export function prefetchSpaceRouteIntent(queryClient: QueryClient, spaceId: string) {
  void queryClient.prefetchQuery(getSpaceBootstrapQueryOptions(spaceId));
}
