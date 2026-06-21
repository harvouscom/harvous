import type { QueryClient } from '@tanstack/react-query';
import { normalizePrototypeApiSpaceId } from '../utils/prototype-space-api-id';

/** React Query keys for prototype sidebar data derived from note content (scripture index, TSK connections). */
export function prototypeSpaceDerivedQueryKeys(spaceId: string) {
  const id = normalizePrototypeApiSpaceId(spaceId);
  if (!id) return [];
  return [
    ['prototype', 'space', id, 'scripture-index'] as const,
    ['prototype', 'space', id, 'scripture-connections'] as const,
  ];
}

export function invalidatePrototypeSpaceDerivedQueries(
  queryClient: QueryClient,
  spaceId: string | null | undefined,
): void {
  if (!spaceId) return;
  for (const queryKey of prototypeSpaceDerivedQueryKeys(spaceId)) {
    void queryClient.invalidateQueries({ queryKey });
  }
}
